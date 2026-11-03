import { createApp } from './app.js';
const {app}=createApp();
const port=Number(process.env.PORT || 3100);
app.listen(port,()=>console.log(`Courier app listening on http://localhost:${port}`));
