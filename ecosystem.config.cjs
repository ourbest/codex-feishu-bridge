module.exports = {
  apps: [
    {
      name: 'codex-bridge',
      cwd: __dirname,
      script: 'npm',
      args: 'start',
      env_file: '.env',
      autorestart: true,
      restart_delay: 1000,
      kill_timeout: 5000,
      max_restarts: 20,
      min_uptime: '10s',
      time: true,
    },
  ],
};
