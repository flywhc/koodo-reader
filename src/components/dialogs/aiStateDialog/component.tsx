import React from "react";
import "./aiStateDialog.css";
import { Trans } from "react-i18next";
import { AIStateDialogProps, AIStateDialogState } from "./interface";

class AIStateDialog extends React.Component<AIStateDialogProps, AIStateDialogState> {
  constructor(props: AIStateDialogProps) {
    super(props);
    this.state = {
      isAIState: false,
      message: "",
    };
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
          <div className="aistate-page-content">
            <pre>hello world</pre>
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
