<?php
/**
 * Proxy /api/* → backend Node.js (PM2, puerto 3010).
 */
$backend = 'http://127.0.0.1:3010';
$uri = $_SERVER['REQUEST_URI'] ?? '/';
$path = preg_replace('#^/api#', '', parse_url($uri, PHP_URL_PATH) ?: '');
$query = parse_url($uri, PHP_URL_QUERY);
$url = rtrim($backend, '/') . $path . ($query ? '?' . $query : '');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$headers = [];
if (!empty($_SERVER['HTTP_COOKIE'])) {
    $headers[] = 'Cookie: ' . $_SERVER['HTTP_COOKIE'];
}
if (!empty($_SERVER['CONTENT_TYPE'])) {
    $headers[] = 'Content-Type: ' . $_SERVER['CONTENT_TYPE'];
}

$body = file_get_contents('php://input');
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
if ($body !== false && $body !== '' && !in_array($method, ['GET', 'HEAD'], true)) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

$response = curl_exec($ch);
if ($response === false) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => 'Backend no disponible']);
    exit;
}

$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$rawHeaders = substr($response, 0, $headerSize);
$respBody = substr($response, $headerSize);
curl_close($ch);

http_response_code($status);
foreach (explode("\r\n", $rawHeaders) as $line) {
    if (stripos($line, 'HTTP/') === 0) continue;
    if (stripos($line, 'Transfer-Encoding:') === 0) continue;
    if (stripos($line, 'Set-Cookie:') === 0 || stripos($line, 'Content-Type:') === 0) {
        header($line, stripos($line, 'Set-Cookie:') === 0 ? false : true);
    }
}
echo $respBody;
