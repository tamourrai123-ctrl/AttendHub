export interface AppConfig {
  port: number;
  frontendUrl: string;
  nodeEnv: string;
  jwtSecret: string;
}

export interface RootConfig {
  app: AppConfig;
}

export default (): RootConfig => ({
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    nodeEnv: process.env.NODE_ENV ?? 'development',
    jwtSecret: process.env.JWT_SECRET ?? 'change-me',
  },
});
