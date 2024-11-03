export interface AIStateDialogProps {
  handleAIStateDialog: (isAIState: boolean) => void;
  isOpenAIStatePage: boolean;
}
export interface AIStateDialogState {
  isAIState: boolean;
  message: string;
  cliOutputs: CLIOutput[];
}

export interface CLIOutput {
  type: 'stdout' | 'stderr' | 'error';
  content: string;
  timestamp: string;
}