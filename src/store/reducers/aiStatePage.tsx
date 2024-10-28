const initialState = {
  isAIState: false,
  isOpenAIStatePage: false,
};

export function aiStatePage(
  state = initialState,
  action: { type: string; payload: any }
) {
  switch (action.type) {
    case "HANDLE_AI_STATE_DIALOG":
      return {
        ...state,
        isAIState: action.payload,
        isOpenAIStatePage: action.payload,
      };
    default:
      return state;
  }
}
