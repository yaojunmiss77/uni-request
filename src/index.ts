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
  /** 上传文件的请求超时时间，ms为单位，默认5s */
  uploadTimeout?: number;
  /** 请求尝试延迟时间默认3s，ms为单位 */
  retryDelay?: number;
  /** token，APP初始化给到小程序的token */
  token?: string;
  /** 向APP得到token的event事件名称，默认getToken */
  tokenEventName?: string;
  /** token的header名称，默认Authorization */
  tokenHeader?: string;
  /** 传入的token前缀，默认Bearer ，注意Bearer有个空字符串*/
  tokenPrefix?: string;
  /** 自定义得到token的函数，默认使用从客户端获取token的方式 */
  getTokenFun?: () => Promise<string>;
}

/** 客户端交互内置事件名称 */
const EVENT_NAME = {
  /** 通知APP退出到登录页面 */
  LOGOUT: 'logout',
};

function requestPromise(options?: RequestOptions & { timeout: number }): Promise<RequestSuccessCallbackResult> {
  return new Promise((res, rej) => {
    uni.request({
      ...options,
      success: res,
      fail: rej,
    });
  });
}
function uploadFilePromise(options?: UploadFileOption): Promise<UploadFileSuccessCallbackResult> {
  return new Promise((res, rej) => {
    uni.uploadFile({
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
    uni.sendNativeEvent(eventName, {}, (resData: string) => {
      clearTimeout(timeout);
      res(resData);
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
  /** 上传文件的超时时间 */
  private uploadTimeout = 5000;
  private retryDelay = 3000;
  private token?: string;
  private tokenEventName = 'getToken';
  /** token的header名称，默认Authorization */
  private tokenHeader = 'Authorization';
  /** 传入的token前缀，默认Bearer ，注意Bearer有个空字符串*/
  private tokenPrefix = 'Bearer ';
  /** 自定义得到token的函数 */
  private getTokenFun?: () => Promise<string>;

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
      /** 超时时间 */
      timeout?: number;
    } & RequestOptions &
      UploadFileOption,
    callbackPromise = requestPromise,
  ): Promise<T> {
    let url = params.url;
    /** 如果是http开头的，则不需要加入baseUrl */
    if (!/^https?:\/\//.test(url)) {
      url = `${this.baseUrl.replace(/\/$/, '')}/${params.url.replace(/^\//, '')}?t=${Date.now()}`;
    } else {
      url = `${params.url}?t=${Date.now()}`;
    }
    const header = {
      ...this.header,
      ...params.header,
    };
    let requestedToken = false;
    let retryCount = 0;
    return new Promise((res, rej) => {
      const retryFucntion = () => {
        /** 因为token需要动态获取，因此放入这里 */
        header[this.tokenHeader] = `${this.tokenPrefix}${this.token}`;
        /** 针对h5调试的时候，因为塞入cookie是不安全的，因此无需塞入cookie，使用登录页后，后端塞入的cookie */
        // #ifdef H5
        if (this.tokenHeader === 'cookie') {
          delete header[this.tokenHeader];
        }
        // #endif
        callbackPromise({ ...params, header, url, timeout: params.timeout || this.timeout })
          .then((resData) => {
            const { statusCode, data } = resData as any;
            if (statusCode === 200) {
              if (!data.errno) {
                res(data.data as T);
              } else {
                this.rejectHandler(rej, resData);
              }
              /** 针对小网关进行的处理，历史遗留问题，需要兼容 */
            } else if (403 === statusCode && !requestedToken) {
              // #ifndef H5
              (this.getTokenFun ? this.getTokenFun() : getToken(this.tokenEventName))
                .then((token: string) => {
                  this.token = token;
                  requestedToken = true;
                  /** 获取token应该立马请求,不需要延迟 */
                  retryFucntion();
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
              /** 最新无权限处理方案，直接调用客户端logout事件，退出到登录页 */
            } else if (401 === statusCode) {
              this.rejectHandler(rej, resData);
              uni.sendNativeEvent(EVENT_NAME.LOGOUT, {}, () => {
                console.log('用户无权限，调用logout事件，退出到登录页');
              });
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
  /**
   * 文件上传
   * @param url 上传的url
   * @param filePath 文件路径
   * @param formData HTTP 请求中其他额外的 form data
   * @param name 文件对应的 key , 开发者在服务器端通过这个 key 可以获取到文件二进制内容,默认key为file
   * @param header
   * @returns
   */
  public uploadFile<T>(
    url: string,
    filePath: string,
    formData?: Record<string, any>,
    name = 'file',
    header?: Record<string, string>,
  ) {
    return this.request<T>(
      { url, filePath, formData, name, header, timeout: this.uploadTimeout, method: 'PUT' },
      uploadFilePromise,
    );
  }
}

export default UniRequest;
