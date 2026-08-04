module.exports = {
  apps: [{
    name: '3ertiempo-api',
    script: './src/index.js',
    cwd: '/home/u906481625/domains/3ertiempo.online/backend',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production',
      PORT: 3010,
    },
  }],
};
