import React from "react";
import "./knowledgeBase.css";
import { KnowledgeBaseProps, KnowledgeBaseState } from "./interface";

class KnowledgeBase extends React.Component<KnowledgeBaseProps, KnowledgeBaseState> {
  constructor(props: KnowledgeBaseProps) {
    super(props);
    this.state = {
      input: "",
      messages: [],
    };
  }

  handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ input: e.target.value });
  };

  handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!this.state.input.trim()) return;

    const userMessage = { role: "user", content: this.state.input };
    this.setState((prevState) => ({
      messages: [...prevState.messages, userMessage],
      input: "",
    }));

    // 这里应该调用 ChatGPT API
    // 为了示例，我们只是模拟一个响应
    setTimeout(() => {
      const assistantMessage = { role: "assistant", content: "这是一个模拟的 ChatGPT 响应。" };
      this.setState((prevState) => ({
        messages: [...prevState.messages, assistantMessage],
      }));
    }, 1000);
  };

  render() {
    const { t } = this.props;
    return (
      <div 
        className="knowledge-base-container"
        style={this.props.isCollapsed ? { width: "calc(100vw - 70px)", left: "70px" } : {}}
      >
        <h2>{t("Knowledge Base")}</h2>
        <div className="chat-container">
          {this.state.messages.map((message, index) => (
            <div key={index} className={`message ${message.role}`}>
              {message.content}
            </div>
          ))}
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