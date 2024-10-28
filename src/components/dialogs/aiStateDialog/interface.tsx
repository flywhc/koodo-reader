export interface AIStateDialogProps {
  handleAIStateDialog: (isAIState: boolean) => void;
  isOpenAIStatePage: boolean;
}
export interface AIStateDialogState {
  isAIState: boolean;
  message: string;
}
