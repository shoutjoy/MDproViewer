/*
 * The worker entry must live at the application root so its scope can include
 * index.html. The implementation stays with the PWA app under Apps/PWA.
 */
importScripts('./Apps/PWA/service-worker.js');
