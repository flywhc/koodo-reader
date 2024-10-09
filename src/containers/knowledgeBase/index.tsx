import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import KnowledgeBase from "./component";
import { stateType } from "../../store";

const mapStateToProps = (state: stateType) => {
    return {
      isCollapsed: state.sidebar.isCollapsed,
    };
  };
  
const actionCreator = {};

export default connect(
  mapStateToProps,
  actionCreator
)(withTranslation()(KnowledgeBase as any) as any);
