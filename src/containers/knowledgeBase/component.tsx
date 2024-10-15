/* eslint-disable jsx-a11y/anchor-is-valid */
import React from "react";
import toast from "react-hot-toast";
import Swal from 'sweetalert2'
import ReactMarkdown from 'react-markdown' // Markdown解析
import remarkMath from 'remark-math'; // 数学公式
import rehypeKatex from 'rehype-katex'; // 科学表达式解析
import remarkGfm from 'remark-gfm'; // github风格markdown
import rehypeRaw from "rehype-raw"; // markdown内含 HTML语法解析
import "./knowledgeBase.css";
import { KnowledgeBaseProps, KnowledgeBaseState, Source } from "./interface";
import StringifyWithFloats from "stringify-with-floats";
import BookUtil from "../../utils/fileUtils/bookUtil";

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

  componentDidMount() {
    const savedMessages = localStorage.getItem('knowledgeBaseMessages');
    if (savedMessages) {
      this.setState({ messages: JSON.parse(savedMessages) });
    }

    // 动态加载 KaTeX CSS 文件
    const linkElement = document.createElement('link');
    linkElement.rel = 'stylesheet';
    linkElement.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css';
    linkElement.integrity = 'sha384-GvrOXuhMATgEsSwCs4smul74iXGOixntILdUW9XmUC6+HX0sLNAK3q71HotJqlAn';
    linkElement.crossOrigin = 'anonymous';
    document.head.appendChild(linkElement);
  }

  componentWillUnmount() {
    localStorage.setItem('knowledgeBaseMessages', JSON.stringify(this.state.messages));
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
      console.log("开始读取SSE流");
      let fullAnswer = ""; // 存储回答的内容
      let finalSources: Source[] = []; // 存储向量数据库搜到的引用来源
      // 读取SSE流的响应内容。SSE协议本身不支持POST，这里用fetch模拟SSE，目前不支持SSE的断线重连
      let buffer = ""; // 引入缓冲区
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        buffer += chunk; // 将读取到的数据追加到缓冲区
        let lineStart = 0;
        while (lineStart < buffer.length) {
          const lineEnd = buffer.indexOf('\n', lineStart);
          if (lineEnd === -1) break; // 如果没有找到换行符,说明当前缓冲区中的数据不完整,等待下一次读取
          const line = buffer.slice(lineStart, lineEnd); // 取出完整的一行数据
          lineStart = lineEnd + 1;
          console.log("读取到SSE流的一行完整数据");
          // SSE流每行以data:开头，所以需要去掉data:
          if (line.startsWith("data:")) {
            try {
              const data = JSON.parse(line.slice(5));
              if (data.error) {
                throw new Error(data.error);
              }
              // 向现有答案添加新内容
              console.log("向现有答案添加新内容");
              if (data.choices && data.choices[0].delta.content) {
                fullAnswer += data.choices[0].delta.content;
                this.setState({ currentAnswer: fullAnswer });
              }

              // 如果引用来源为空，则更新引用来源
              // 1728755142168是书籍的key，epub是文件的扩展名
              // "docs": [
              //  "出处 [1] [1728755142168.epub](http://127.0.0...文件下载地址) \n\n总之，\n看到工作有进展感觉挺不……好才刚帮我办完丧礼也说不定。\n\n",
              //  "出处 [2] [1728755142168.epub](http://127.0.0...文件下载地址) \n\n所以今天我要来想想看有没有办……的电子元件就会停止运作。\n\n",
              //],
              if (data.docs && this.state.sources.length === 0) {
                console.log("更新引用来源");
                const extractContent = (source: string) => {
                  const index = source.indexOf(')');
                  if (index !== -1) {
                    let content = source.slice(index + 1).trim();
                    if (content.startsWith(" \n\n")) {
                      content = content.slice(3);
                    }
                    if (content.endsWith("\n\n")) {
                      content = content.slice(0, -2);
                    }
                    return content;
                  }
                  return "";
                };

                finalSources = [];
                // eslint-disable-next-line no-loop-func
                data.docs.map(async (source: string, index: number) => {
                  // 提取第二个中括号中的内容
                  const matches = source.match(/\[([^\]]+)\]/g);
                  const bookVectorizedName = matches && matches[1] ? matches[1].slice(1, -1) : `${this.props.t("出处")} ${index + 1}`;
                  const bookName = bookVectorizedName.split(".")[0];
                  const bookData = await BookUtil.getBookFromKey(bookName);
                  const content = extractContent(source);
                  const sourceTitle = bookData ? bookData.name : `未找到数据库书籍 ${bookVectorizedName}`;
                  finalSources.push({ key: bookName, title: sourceTitle, content: content });
                });
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
        buffer = buffer.slice(lineStart); // 更新缓冲区,去除已处理的行
      }

      // 如果API调用成功，将回答内容和引用来源添加到messages中
      if (!this.state.error) {
        console.log("API调用成功");
        this.setState((prevState) => {
          const newMessages = [
            ...prevState.messages,
            { role: "assistant", content: fullAnswer, sources: finalSources },
          ];
          localStorage.setItem('knowledgeBaseMessages', JSON.stringify(newMessages));
          console.log("更新本地存储");
          return {
            messages: newMessages,
            currentAnswer: "",
          };
        });
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
  renderSourcesForMessage = (sources: Source[] | undefined) => {
    const { t } = this.props;
    if (!sources || sources.length === 0) return null;
    console.log("渲染引用来源");
    return (
      <div className="sources">
        {sources.map((source: Source, index: number) => {
          console.log("渲染引用来源的每一项: " + index);
          return (
            <div key={index}>
              <a href="#"
                id={`ref_link_${index}`}
                className="ref-link"
                onClick={(e) => this.showSourceContent(e, source)}>
                {t("出处")} {index + 1}: {source.title}
              </a>
            </div>
          );
        })}
      </div>
    );
  };

  // 点击来源的链接后，弹出显示引用来源的具体内容
  showSourceContent = async (e: React.MouseEvent, source: Source) => {
    e.preventDefault();
  
    const result = await Swal.fire({
      title: '参考原文',
      html: `<div style="max-height: 50vh; overflow-y: auto;">${source.content.replace(/\\n/g, "<br/>")}</div>`,
      confirmButtonText: '查看文档',
      confirmButtonColor: '#000000',
      cancelButtonText: " 关闭 ",
      cancelButtonColor: '#000000',
      showCancelButton: true,
    });

    if (result.isConfirmed) {
      const bookData = await BookUtil.getBookFromKey(source.key);
      if (bookData) {
        BookUtil.RedirectBook(bookData, this.props.t, this.props.history);
      } else {
        toast.error(this.props.t("Book not found in local library. Please remove the book and try again."));
      }
    }
  };

  // 添加清除历史消息的方法
  handleClearHistory = () => {
    this.setState({ messages: [], currentAnswer: "", sources: [], error: null });
    localStorage.removeItem('knowledgeBaseMessages');
  };

  // 渲染知识库页面
  render() {
    const { t } = this.props;
    return (
      <div 
        className="knowledge-base-container"
        style={this.props.isCollapsed ? { width: "calc(100vw - 70px)", left: "70px" } : {}}
      >
        <h2>{t("KnowledgeBase")}</h2>
        <div className="chat-container">
          {this.state.messages.map((message, index) => ( // 渲染历史对话内容
            <div key={index} className={`message ${message.role}`}>
              {message.role === "assistant" && this.renderSourcesForMessage(message.sources)}
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex, rehypeRaw]}
              >{message.content}</ReactMarkdown>

            </div>
          ))}
          {this.state.currentAnswer && ( // 渲染当前回答内容
            <div className="message assistant">
              {this.renderSourcesForMessage(this.state.sources)}
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex, rehypeRaw]}
              >{this.state.currentAnswer}</ReactMarkdown>
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
            className="input-box"
            value={this.state.input}
            onChange={this.handleInputChange}
            placeholder={t("Ask a question")}
          />
          <button type="submit" className="button">{t("Send")}</button>
          <button type="button" className="button" onClick={this.handleClearHistory}>{t("Clear History")}</button>
        </form>
      </div>
    );
  }
}

export default KnowledgeBase;