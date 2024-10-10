import React from "react";
import Swal from 'sweetalert2'
import "./knowledgeBase.css";
import { KnowledgeBaseProps, KnowledgeBaseState } from "./interface";
import StringifyWithFloats from "stringify-with-floats";

// 知识库检索页面
class KnowledgeBase extends React.Component<KnowledgeBaseProps, KnowledgeBaseState> {
  constructor(props: KnowledgeBaseProps) {
    super(props);
    this.state = {
      input: "",
      messages: [],
      currentAnswer: "",
      sources: [],
      error: null,
    };
  }

  // 输入框内容改变时，更新状态
  handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ input: e.target.value });
  };

  // 提交时，发送请求
  handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!this.state.input.trim()) return;

    const userMessage = { role: "user", content: this.state.input };
    this.setState((prevState) => ({
      messages: [...prevState.messages, userMessage],
      input: "",
      currentAnswer: "正在查询，请稍等……",
      sources: [],
      error: null,
    }));

    // 将输入内容转换为JSON格式，因为API需要浮点数，需要特殊的处理
    const stringify = StringifyWithFloats({ score_threshold: "float", temperature: "float" })

    try {
      // 发送langchain chatchat kb_chat的请求
      const response = await fetch(
        "http://127.0.0.1:7861/knowledge_base/local_kb/Jason%20Test/chat/completions",
        {
          method: "POST",
          // 使用SSE流式传输头
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Connection": "keep-alive",
          },
          body: stringify({
            messages: [{ role: "user", content: this.state.input }],
            model: "qwen2:7b",
            stream: true,
            top_k: 3,
            score_threshold: 2.0,
            temperature: 0.7,
            prompt_name: "default",
            return_direct: false,
          }),
        }
      );

      // 如果服务器返回失败，抛出错误在后面一起处理
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      // 获取SSE流的读取器
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      let fullAnswer = ""; // 存储回答的内容
      let finalSources: string[] = []; // 存储向量数据库搜到的引用来源
      // 读取SSE流的响应内容。SSE协议本身不支持POST，这里用fetch模拟SSE，目前不支持SSE的断线重连
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        // SSE是流式传输，所以需要逐行读取
        for (const line of lines) {
          // SSE流每行以data:开头，所以需要去掉data:
          if (line.startsWith("data:")) {
            try {
              const data = JSON.parse(line.slice(5));
              if (data.error) {
                throw new Error(data.error);
              }
              // 向现有答案添加新内容
              if (data.choices && data.choices[0].delta.content) {
                fullAnswer += data.choices[0].delta.content;
                this.setState({ currentAnswer: fullAnswer });
              }
              // 更新引用来源
              // "docs": [
              //  "出处 [1] [火星任务.epub](http://127.0.0...文件下载地址) \n\n总之，\n看到工作有进展感觉挺不……好才刚帮我办完丧礼也说不定。\n\n",
              //  "出处 [2] [火星任务.epub](http://127.0.0...文件下载地址) \n\n所以今天我要来想想看有没有办……的电子元件就会停止运作。\n\n",
              //],
              if (data.docs) {
                finalSources = data.docs;
                this.setState({ sources: finalSources });
              }
            } catch (error) {
              // 如果解析JSON时出错，将错误信息存储在state中
              if (error instanceof Error) {
                this.setState({ error: error.message });
              } else {
                console.error("解析 JSON 时出错:", error);
              }
            }
          }
        }
      }
      // 如果API调用成功，将回答内容和引用来源添加到messages中
      if (!this.state.error) {
        this.setState((prevState) => ({
          messages: [
            ...prevState.messages,
            { role: "assistant", content: fullAnswer, sources: finalSources },
          ],
          currentAnswer: "",
        }));
      }
    } catch (error) {
      // 如果API调用失败，将错误信息存储在state中
      if (error instanceof Error) {
        this.setState({ error: error.message });
      } else {
        console.error("API 调用出错:", error);
      }
    }
  };

  // 渲染引用来源
  renderSourcesForMessage = (sources: string[] | undefined) => {
    const { t } = this.props;
    if (!sources || sources.length === 0) return null;
    return (
      <div className="sources">
        {sources.map((source, index) => {
          // 提取第二个中括号中的内容
          const matches = source.match(/\[([^\]]+)\]/g);
          const sourceTitle = matches && matches[1] ? matches[1].slice(1, -1) : `${t("出处")} ${index + 1}`;
          return (
            <div key={index}>
              <a href="#"
                id={`ref_link_${index}`}
                className="ref-link"
                onClick={(e) => this.showSourceContent(e, source)}>
                {t("出处")} {index + 1}: {sourceTitle}
              </a>
            </div>
          );
        })}
      </div>
    );
  };

  // 点击来源的链接后，弹出显示引用来源的具体内容
  showSourceContent = (e: React.MouseEvent, source: string) => {
    e.preventDefault();
    const content = source.split("\n\n")[1];
    Swal.fire({
      title: '参考原文',
      html: `<div style="max-height: 50vh; overflow-y: auto;">${content.replace(/\\n/g, "<br/>")}</div>`,
      footer: '<a href="#" class="swal2-close">查看文档</a>',
      confirmButtonText: '关闭',
      confirmButtonColor: '#000000',
      customClass: {
        popup: 'custom-popup-class'
      }
    });
  };

  // 渲染知识库页面
  render() {
    const { t } = this.props;
    return (
      <div 
        className="knowledge-base-container"
        style={this.props.isCollapsed ? { width: "calc(100vw - 70px)", left: "70px" } : {}}
      >
        <h2>{t("Knowledge Base")}</h2>
        <div className="chat-container">
          {this.state.messages.map((message, index) => ( // 渲染历史对话内容
            <div key={index} className={`message ${message.role}`}>
              {message.role === "assistant" && this.renderSourcesForMessage(message.sources)}
              {message.content}
            </div>
          ))}
          {this.state.currentAnswer && ( // 渲染当前回答内容
            <div className="message assistant">
              {this.renderSourcesForMessage(this.state.sources)}
              {this.state.currentAnswer}
            </div>
          )}
          {this.state.error && ( // 渲染错误信息
            <div className="message error">
              {this.state.error}
            </div>
          )}
        </div>
        <form onSubmit={this.handleSubmit}>
          <input
            type="text"
            value={this.state.input}
            onChange={this.handleInputChange}
            placeholder={t("Ask a question")}
          />
          <button type="submit">{t("Send")}</button>
        </form>
      </div>
    );
  }
}

export default KnowledgeBase;