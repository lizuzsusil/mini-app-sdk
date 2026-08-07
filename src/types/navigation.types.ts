export interface NavigationTarget {
  app: string;
  route: string;
  params?: Record<string, string>;
  replace?: boolean;
}

export interface NavigationState {
  current: string;
  history: string[];
}

export interface NavigationRouterResult {
  /** true = the mini app handled the step itself; false = the host should take over. */
  consumed: boolean;
}

export interface NavigationRouterSdkModule {
  back(consumed?: boolean): Promise<NavigationRouterResult>;
  push(consumed?: boolean): Promise<NavigationRouterResult>;
}

export interface NavigationSdkModule {
  navigate(target: NavigationTarget): Promise<void>;
  getCurrent(): Promise<NavigationState>;
  router: NavigationRouterSdkModule;
}
