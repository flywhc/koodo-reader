/* eslint-disable jsx-a11y/anchor-is-valid */
import React from "react";
import toast from "react-hot-toast";
import Swal from 'sweetalert2'
import ReactMarkdown from 'react-markdown' // Markdown解析
import remarkMath from 'remark-math'; // 数学公式
import rehypeKatex from 'rehype-katex'; // 科学表达式解析
import remarkGfm from 'remark-gfm'; // github风格markdown
import rehypeRaw from "rehype-raw"; // markdown内含 HTML语法解析
import StringifyWithFloats from "stringify-with-floats";
import { KnowledgeBaseProps, KnowledgeBaseState, Source } from "./interface";
import BookUtil from "../../utils/fileUtils/bookUtil";
import { preprocessLaTeX } from "./markdownUtil";
import "./knowledgeBase.css";
import "katex/dist/katex.min.css";
import { API_BASE_URL, MODEL_CONFIG } from "../../config";

// 知识库检索页面
class KnowledgeBase extends React.Component<KnowledgeBaseProps, KnowledgeBaseState> {
  private chatContainerRef = React.createRef<HTMLDivElement>();
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

    setTimeout(() => {
      this.scrollToBottom();
    }, 0);
  }

  componentWillUnmount() {
    localStorage.setItem('knowledgeBaseMessages', JSON.stringify(this.state.messages));
  }
  componentDidUpdate(prevProps: KnowledgeBaseProps, prevState: KnowledgeBaseState) {
    if (prevState.currentAnswer.length !== this.state.currentAnswer.length) {
      this.scrollToBottom();
    }
  }

  scrollToBottom = () => {
    if (this.chatContainerRef.current) {
      this.chatContainerRef.current.scrollTop = this.chatContainerRef.current.scrollHeight;
    }
  };

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
        `${API_BASE_URL}/knowledge_base/local_kb/Jason%20Test/chat/completions`,
        {
          method: "POST",
          // 使用SSE流式传输头
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Connection": "keep-alive",
          },
          body: stringify({
            messages: [{ role: "user", content: this.state.input }],
            ...MODEL_CONFIG,
            stream: true,
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

              // 如果引用来源为空，则更新引用来源
              // 1728755142168是书籍的key，epub是文件的扩展名
              // "docs": [
              //  "出处 [1] [1728755142168.epub](http://127.0.0...文件下载地址) \n\n总之，\n看到工作有进展感觉挺不……好才刚帮我办完丧礼也说不定。\n\n",
              //  "出处 [2] [1728755142168.epub](http://127.0.0...文件下载地址) \n\n所以今天我要来想想看有没有办……的电子元件就会停止运作。\n\n",
              //],
              if (data.docs && this.state.sources.length === 0) {
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

                const finalSources: Source[] = [];
                const promises = data.docs.map(async (source: string, index: number) => {
                  // 提取第二个中括号中的内容
                  const matches = source.match(/\[([^\]]+)\]/g);
                  const bookVectorizedName = matches && matches[1] ? matches[1].slice(1, -1) : `${this.props.t("出处")} ${index + 1}`;
                  const bookName = bookVectorizedName.split(".")[0];
                  const bookData = await BookUtil.getBookFromKey(bookName);
                  const content = extractContent(source);
                  const sourceTitle = bookData ? bookData.name : `未找到数据库书籍 ${bookVectorizedName}`;
                  finalSources.push({ key: bookName, title: sourceTitle, content: content });
                });

                await Promise.all(promises);
                this.setState({ sources: finalSources });
              }
            } catch (error) {
              console.error("解析 JSON 时出错:", error);
              let errorMessage = "未知错误";
              if (typeof error === 'string') {
                errorMessage = error;
              } else if (error instanceof Error) {
                errorMessage = error.message;
              }
              // 将错误信息存储在state中显示
              this.setState({ error: errorMessage });
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
            { role: "assistant", content: fullAnswer, sources: this.state.sources },
          ];
          localStorage.setItem('knowledgeBaseMessages', JSON.stringify(newMessages));
          return {
            messages: newMessages,
            currentAnswer: "",
            sources: [],
            error: null,
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
    return (
      <div className="sources">
        {sources.map((source: Source, index: number) => {
//          console.log("渲染引用来源的每一项: " + index);
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
        <div className="chat-container" ref={this.chatContainerRef}>
          {this.state.messages.map((message, index) => ( // 渲染历史对话内容
            <div key={index} className={`message ${message.role}`}>
              {message.role === "assistant" && this.renderSourcesForMessage(message.sources)}
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex, rehypeRaw]}
              >{preprocessLaTeX(message.content)}</ReactMarkdown>
            </div>
          ))}
          {this.state.currentAnswer && ( // 渲染当前回答内容
            <div className="message assistant">
              {this.renderSourcesForMessage(this.state.sources)}
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex, rehypeRaw]}
              >{preprocessLaTeX(this.state.currentAnswer)}</ReactMarkdown>
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
