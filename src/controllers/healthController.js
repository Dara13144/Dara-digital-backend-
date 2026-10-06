export const healthController = {
  getHealth(req, res) {
    return res.status(200).json({
      status: 'ok',
      service: 'daramini-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  }
};
