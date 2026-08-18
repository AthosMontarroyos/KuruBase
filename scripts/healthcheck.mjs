const response = await fetch("http://127.0.0.1:8080/health/ready");
process.exit(response.ok ? 0 : 1);
