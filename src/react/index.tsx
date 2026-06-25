import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  type MiniAppSdk,
  createMiniAppSdk,
  type PlatformUser,
} from '../index';

interface SdkContextValue {
  sdk: MiniAppSdk | null;
  user: PlatformUser | null;
  isReady: boolean;
  error: Error | null;
}

const SdkContext = createContext<SdkContextValue>({
  sdk: null,
  user: null,
  isReady: false,
  error: null,
});

export interface MiniAppSdkProviderProps {
  moduleId: string;
  children: ReactNode;
  fallback?: ReactNode;
  errorFallback?: (error: Error) => ReactNode;
}

export function MiniAppSdkProvider({
  moduleId,
  children,
  fallback,
  errorFallback,
}: MiniAppSdkProviderProps) {
  const [sdk, setSdk] = useState<MiniAppSdk | null>(null);
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    const instance = createMiniAppSdk({ moduleId });

    instance
      .initialize()
      .then(async () => {
        if (!mounted) return;
        setSdk(instance);
        const u = await instance.auth.getUser();
        setUser(u);
        setIsReady(true);
        instance.telemetry.track('mini_app.mounted', { moduleId });
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err : new Error(String(err)));
      });

    return () => {
      mounted = false;
      instance.destroy();
    };
  }, [moduleId]);

  if (error && errorFallback) return <>{errorFallback(error)}</>;
  if (error) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p>Failed to connect to platform shell.</p>
        <p style={{ fontSize: 12, color: '#666' }}>{error.message}</p>
      </div>
    );
  }
  if (!isReady) return <>{fallback ?? <div>Connecting to platform...</div>}</>;

  return (
    <SdkContext.Provider value={{ sdk, user, isReady, error }}>
      {children}
    </SdkContext.Provider>
  );
}

export function useMiniAppSdk(): MiniAppSdk {
  const { sdk } = useContext(SdkContext);
  if (!sdk) throw new Error('useMiniAppSdk must be used within MiniAppSdkProvider');
  return sdk;
}

export function usePlatformUser(): PlatformUser | null {
  return useContext(SdkContext).user;
}

export function useSdkReady(): boolean {
  return useContext(SdkContext).isReady;
}
