import { handleAIStateDialog } from "../../../store/actions";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { stateType } from "../../../store";
import AIStateDialog from "./component";

const mapStateToProps = (state: stateType) => {
  return {
    isAIState: state.aiStatePage.isAIState,
  };
};

const actionCreator = {
  handleAIStateDialog,
};

export default connect(
  mapStateToProps,
  actionCreator
)(withTranslation()(AIStateDialog as any) as any);
