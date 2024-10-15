import { RouteComponentProps } from "react-router";
import { WithTranslation } from "react-i18next";

export interface KnowledgeBaseProps extends RouteComponentProps, WithTranslation {
    isCollapsed: boolean;
  }

  export interface KnowledgeBaseState {
    input: string;
    messages: Message[];
    currentAnswer: string;
    sources: Source[];
    error: string | null;
  }

  export interface Message {
    role: string;
    content: string;
    sources?: Source[];
  }
  
  export interface Source {
    key: string;
    title: string;
    content: string;
  }


