/*
 * Version: 1.1
 * Dependencies: express
 * * Change Log:
 * - Version 1.0: Código inicial con latencia en el broadcast de logs.
 * - Version 1.1: Se implementó EventEmitter para desacoplar el webhook del streaming SSE.
 * - Version 1.1: Se optimizó la respuesta del POST para que sea instantánea sin esperar el broadcast.
 * - Version 1.1: Se mejoró la gestión de memoria en el array de clientes.
 * - Version 1.1: Se añadió un pequeño delay con setImmediate para no bloquear el event loop.
 */

const express = require('express');
const path = require('path');
const EventEmitter = require('events');

const app = express();
const logEmitter = new EventEmitter();

// Aumentar límite por si llegan logs muy largos
app.use(express.json({ limit: '10mb' })); 

let logs = []; // Almacena las últimas 100 líneas
let clients = []; // Clientes conectados viendo la página

// Webhook para recibir logs de GitHub CI
app.post('/auth/terminalonly/:runid', (req, res) => {
    const rawLine = req.body.log;
    const runId = req.params.runid;

    if (rawLine !== undefined) {
        const logEntry = `[Run: ${runId}] ${rawLine}`;
        
        // Actualizamos el historial interno
        logs.push(logEntry);
        if (logs.length > 100) {
            logs.shift(); 
        }

        // Emitimos el evento de forma asíncrona para no bloquear esta petición
        setImmediate(() => {
            logEmitter.emit('new_log', logEntry);
        });
    }
    
    // Respondemos de una al CI para que no se quede esperando
    res.status(200).send('OK');
});

// Endpoint SSE (Server-Sent Events) para el navegador
app.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*'); // Por si las moscas con el CORS
    
    // Al conectar, enviar el historial actual de las 100 líneas
    res.write(`data: ${JSON.stringify({ init: logs })}\n\n`);

    // Listener para nuevos logs
    const onNewLog = (logEntry) => {
        res.write(`data: ${JSON.stringify({ line: logEntry })}\n\n`);
    };

    logEmitter.on('new_log', onNewLog);

    // Limpiar cuando el usuario cierra la pestaña
    req.on('close', () => {
        logEmitter.removeListener('new_log', onNewLog);
        res.end();
    });
});

// Servir el frontend
app.use(express.static(path.join(__dirname, 'public')));

// Render utiliza el puerto de entorno por defecto
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Terminal pro corriendo en el puerto ${PORT}`);
});
