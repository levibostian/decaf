import { stub } from "@std/testing/mock";
import { Logger } from "./log.ts";

export interface LogMock extends Logger {
  messages: { level: ("debug" | "warning" | "error" | "notice" | "message"), message: string }[];

  getLogs({includeDebugLogs}: {includeDebugLogs: boolean}): string[]
}

export const getLogMock = () => {
  const loggerObject = {} as LogMock;

  (loggerObject as any).messages = [];

  stub(loggerObject, "debug", (args) => {    
    loggerObject.messages.push({ level: "debug", message: args });
  });
  stub(loggerObject, "warning", (args) => {    
    loggerObject.messages.push({ level: "warning", message: args });    
  });
  stub(loggerObject, "error", (args) => {    
    loggerObject.messages.push({ level: "error", message: args });
  });
  stub(loggerObject, "notice", (args) => {    
    loggerObject.messages.push({ level: "notice", message: args });
  });
  stub(loggerObject, "message", (args) => {    
    loggerObject.messages.push({ level: "message", message: args });
  });

  loggerObject.getLogs = ({includeDebugLogs}: {includeDebugLogs: boolean}) => {
    return loggerObject.messages
      .filter((message) => includeDebugLogs || message.level !== "debug")
      .map((message) => message.message);
  }

  return loggerObject;
}