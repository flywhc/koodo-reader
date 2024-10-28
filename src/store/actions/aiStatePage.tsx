export function handleAIStateDialog(isOpenAIStatePage: boolean) {
  return {
    type: "HANDLE_AI_STATE_DIALOG",
    payload: isOpenAIStatePage,
  };
}
