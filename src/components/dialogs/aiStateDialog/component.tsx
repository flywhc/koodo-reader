import React from "react";
import "./aiStateDialog.css";
import { Trans } from "react-i18next";
import { AIStateDialogProps, AIStateDialogState } from "./interface";
const { ipcRenderer } = window.require('electron');



class AIStateDialog extends React.Component<AIStateDialogProps, AIStateDialogState> {
  private outputRef = React.createRef<HTMLDivElement>();
  
  constructor(props: AIStateDialogProps) {
    super(props);
    this.state = {
      isAIState: false,
      message: "",
      cliOutputs: []
    };
  }

  componentDidMount() {
    // 获取初始输出
    this.updateOutputs();
    
    // 监听新输出
    ipcRenderer.on('cli-output-updated', this.updateOutputs);
  }

  componentWillUnmount() {
    ipcRenderer.removeListener('cli-output-updated', this.updateOutputs);
  }

  componentDidUpdate() {
    // 自动滚动到底部
    if (this.outputRef.current) {
      this.outputRef.current.scrollTop = this.outputRef.current.scrollHeight;
    }
  }

  updateOutputs = async () => {
    const outputs = await ipcRenderer.invoke('get-cli-outputs');
    this.setState({ cliOutputs: outputs });
  }

  handleClose = () => {
    this.props.handleAIStateDialog(false);
  };

  render() {
    return (
      <div>
        <div
          className="aistate-page-container"
          style={
            this.props.isOpenAIStatePage
              ? { animation: "popup 0.1s ease-in-out 0s 1" }
              : { animation: "popout 0.1s ease-in-out 0s 1" }
          }
        >
          <div className="aistate-page-title">
            <Trans>AI State</Trans>
          </div>
          <div className="aistate-page-close-icon" onClick={this.handleClose}>
            <span className="icon-close"></span>
          </div>
          <div className="aistate-page-content" ref={this.outputRef}>
            {this.state.cliOutputs.map((output, index) => (
              <div key={index} className={`cli-output ${output.type}`}>
                <span className="timestamp">{output.timestamp}</span>
                <pre>{output.content}</pre>
              </div>
            ))}
          </div>
        </div>
        <div
          className="aistate-page-overlay"
          onClick={() => {
            this.props.handleAIStateDialog(false);
          }}
          style={
            this.props.isOpenAIStatePage ? { display: "block" } : { display: "none" }
          }
        ></div>
      </div>
    );
  }
}

export default AIStateDialog;
