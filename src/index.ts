export interface IParams {
  /** baseUrl，代理的path也需要填入，比如https://hostname/proxy/ */
  baseUrl?: string;
  /** 公共错误处理函数 */
  onErrorHandler?: (error: any) => void;
  /** 公共请求头 */
  header?: Record<string, string>;
  /** 请求尝试次数，默认3次 */
  maxRetryCount?: number;
  /** 请求超时时间默认10s，ms为单位 */
  timeout?: number;
  /** 请求尝试延迟时间默认1s，ms为单位 */
  retryDelay?: number;
  /** token，APP初始化给到小程序的token */
  token?: string;
  /** 向APP得到token的event事件名称，默认getLoginInfo */
  tokenEventName?: string;
}

function requestPromise(options?: RequestOptions & { timeout: number }): Promise<RequestSuccessCallbackResult> {
  return new Promise((res, rej) => {
    uni.request({
      ...options,
      success: res,
      fail: rej,
    });
  });
}
/** 得到小程序的token */
function getToken(eventName: string): Promise<string> {
  return new Promise((res, rej) => {
    const timeout = setTimeout(rej, 5000);
    uni.sendNativeEvent(eventName, {}, (resData: any) => {
      clearTimeout(timeout);
      res(resData?.token);
    });
  });
}

class UniRequest {
  /** 基准路径 */
  private baseUrl = '';
  /** 错误处理函数 */
  private onErrorHandler = (error: any) => {
    console.error(error);
  };
  /** 默认请求头 */
  private header?: Record<string, string>;
  private maxRetryCount = 3;
  /** 超时时间 */
  private timeout = 10000;
  private retryDelay = 1000;
  private token?: string;
  private tokenEventName = 'getLoginInfo';
  constructor(params?: IParams) {
    if (params) {
      Object.keys(params).forEach((key) => {
        if (params[key as keyof IParams] !== void 0) {
          (this as any)[key] = params[key as keyof IParams];
        }
      });
    }
  }
  private rejectHandler(rej: (err: any) => void, data: any) {
    rej(data);
    this.onErrorHandler?.(data);
  }
  public setParams(params?: IParams) {
    if (params) {
      Object.keys(params).forEach((key) => {
        if (params[key as keyof IParams] !== void 0) {
          (this as any)[key] = params[key as keyof IParams];
        }
      });
    }
  }
  public request<T>(
    params: {
      url: string;
      method: RequestOptions['method'];
      data?: RequestOptions['data'];
      header?: RequestOptions['header'];
    } & RequestOptions,
  ): Promise<T> {
    const url = `${this.baseUrl}${params.url}?t=${Date.now()}`;
    const header = {
      ...this.header,
      ...params.header,
      Authorization: `Bearer ${this.token}`,
    };
    let requestedToken = false;
    let retryCount = 0;
    return new Promise((res, rej) => {
      const retryFucntion = () => {
        requestPromise({ ...params, header, url, timeout: this.timeout })
          .then((resData) => {
            const { statusCode, data } = resData as any;
            if (statusCode === 200) {
              if (!data.errno) {
                res(data.data as T);
              } else {
                this.rejectHandler(rej, resData);
              }
            } else if (statusCode === 403 && !requestedToken) {
              // #ifndef H5
              getToken(this.tokenEventName)
                .then((token: string) => {
                  this.token = token;
                  requestedToken = true;
                  delayRetryFcuntion();
                })
                .catch(() => {
                  if (this.maxRetryCount > retryCount) {
                    delayRetryFcuntion();
                  } else {
                    this.rejectHandler(rej, resData);
                  }
                });
              // #endif
              // #ifdef H5
              this.rejectHandler(rej, resData);
              // #endif
            } else {
              if (this.maxRetryCount > retryCount) {
                delayRetryFcuntion();
              } else {
                this.rejectHandler(rej, resData);
              }
            }
          })
          .catch((rejData) => {
            if (this.maxRetryCount > retryCount) {
              delayRetryFcuntion();
            } else {
              this.rejectHandler(rej, rejData);
            }
          });
      };
      const delayRetryFcuntion = () => {
        setTimeout(() => {
          retryCount++;
          retryFucntion();
        }, this.retryDelay);
      };
      retryFucntion();
    });
  }
  /**
   * post请求
   * @param url
   * @param data 可传可不传
   * @param header
   * @returns
   */
  public post<T>(url: string, data = {}, header?: Record<string, string>) {
    return this.request<T>({ url, data, header, method: 'POST' });
  }
  public get<T>(url: string, data = {}, header?: Record<string, string>) {
    return this.request<T>({ url, data, header, method: 'GET' });
  }
  public delete<T>(url: string, data = {}, header?: Record<string, string>) {
    return this.request<T>({ url, data, header, method: 'DELETE' });
  }
  public put<T>(url: string, data = {}, header?: Record<string, string>) {
    return this.request<T>({ url, data, header, method: 'PUT' });
  }
}

export default UniRequest;
