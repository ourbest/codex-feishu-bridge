export interface Thread {
  id: string;
  name: string;
  description: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  createdAt: Date;
  duration?: string;
}

export interface ThreadManager {
  listThreads(): Promise<Thread[]>;
  cancelThread(id: string): Promise<void>;
  pauseThread(id: string): Promise<void>;
  resumeThread(id: string): Promise<void>;
}
