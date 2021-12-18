import { EventEmitter } from "events";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface WebSocketReconnect {
  maxReconnectAttempts?: number;
  maxRetryAttempts?: number;
}
// a class object to handle websocket connection and reconnection with exponential back-off
export default class WSReconnect extends EventEmitter {
  private ws: WebSocket;
  private reconnectAttempts: number;
  private maxReconnectAttempts: number;
  private intervalRef: number;
  private messageQueue: string[];
  private retryAttempts: number;
  private maxRetryAttempts: number;
  private forcedClose: boolean;

  constructor(url: string, options?: WebSocketReconnect) {
    super();

    this.reconnectAttempts = 1;
    this.maxReconnectAttempts = options?.maxReconnectAttempts ?? 10;
    this.intervalRef = 0;
    this.messageQueue = [];
    this.retryAttempts = 0;
    this.maxRetryAttempts = options?.maxRetryAttempts ?? 3;
    this.forcedClose = false;

    this.ws = new WebSocket(url);

    this.initEventListeners();
    this.connect();
  }

  private initEventListeners() {
    this.ws.addEventListener("close", this.reconnect, { once: true });
    this.ws.addEventListener("error", this.reconnect, { once: true });
  }

  private onOpen = () => {
    this.emit("open");
    this.forcedClose = false;
  };

  private onMessage = (event: MessageEvent<any>) => {
    this.emit("message", event);
  };

  private onError = (error: Event) => {
    this.emit("error", error);
  };

  private onClose = () => {
    if (!this.forcedClose) {
      this.emit("close");
    }
  };

  public send = (data: string) => {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(data);
    } else {
      this.messageQueue.push(data);
    }
  };

  public close = () => {
    this.forcedClose = true;
    this.ws.close();
  };

  private connect = async () => {
    this.ws.onclose = this.onClose;
    this.ws.onerror = this.onError;
    this.ws.onopen = this.onOpen;
    this.ws.onmessage = this.onMessage;

    const messageQueue = [...this.messageQueue];
    for (const msg of messageQueue) {
      await wait(50);
      this.ws.send(msg);
    }

    this.messageQueue.splice(0, messageQueue.length);
  };

  private reconnect = () => {
    if (this.forcedClose) return;

    console.log("ws: reconnecting...");

    if (this.intervalRef) {
      clearInterval(this.intervalRef);
    }

    this.intervalRef = window.setInterval(() => {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log("ws: reconnecting - attempt: ", this.reconnectAttempts);

        this.ws.close();
        this.ws = new WebSocket(this.ws.url);
        this.ws.onopen = () => {
          console.log("ws: connection restored!", this.reconnectAttempts);

          this.reconnectAttempts = 1;
          this.initEventListeners();
          this.connect();

          clearInterval(this.intervalRef);
        };
      } else {
        if (this.retryAttempts < this.maxRetryAttempts) {
          this.retryAttempts++;
          console.log("ws: retrying - attempt: ", this.retryAttempts);

          this.reconnectAttempts = 1;
          this.reconnect();
        } else {
          clearInterval(this.intervalRef);
        }
      }
    }, Math.pow(2, this.retryAttempts + 1) * 1000);
  };
}
