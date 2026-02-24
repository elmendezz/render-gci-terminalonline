const express = require('express');
const path = require('path');
const app = express();

// Aumentar límite por si llegan logs muy largos
app.use(express.json({ limit: '1mb' })); 

let logs = []; // Almacena las últimas 100 líneas
let clients = []; // Clientes conectados viendo la página

// Webhook para recibir logs de GitHub CI
app.post('/auth/terminalonly/:runid', (req, res) => {
    const rawLine = req.body.log;
    const runId = req.params.runid;

    if (rawLine !== undefined) {
        // Formatear el log
        const logEntry = `[Run: ${runId}] ${rawLine}`;
        
        // Manejar lógica de actualización en la misma línea (ej. \r de npm o curl)
        // Si el log es un progreso que debe sobreescribir el anterior, lo manejaremos en el frontend.
        
        logs.push(logEntry);
        
        // Mantener solo las últimas 100 líneas
        if (logs.length > 100) {
            logs.shift(); 
        }
        
        // Emitir a todos los clientes web conectados
        clients.forEach(client => {
            client.res.write(`data: ${JSON.stringify({ line: logEntry })}\n\n`);
        });
    }
    
    // Responder rápido para no bloquear el CI
    res.status(200).send('OK');
});

// Endpoint SSE (Server-Sent Events) para el navegador
app.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    clients.push({ res });
    
    // Al conectar, enviar el historial actual de las 100 líneas
    res.write(`data: ${JSON.stringify({ init: logs })}\n\n`);

    // Limpiar cuando el usuario cierra la pestaña
    req.on('close', () => {
        clients = clients.filter(c => c.res !== res);
    });
});

// Servir el frontend
app.use(express.static(path.join(__dirname, 'public')));

// Render utiliza el puerto de entorno por defecto
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Terminal en vivo corriendo en el puerto ${PORT}`));
