# site 폴더를 http://localhost:8787 로 서빙하는 초경량 정적 서버
$root = Join-Path $PSScriptRoot 'site'
$prefix = 'http://localhost:8787/'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Output "serving $root at $prefix"

$mime = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8';
           '.js'='application/javascript; charset=utf-8'; '.xml'='application/xml; charset=utf-8';
           '.txt'='text/plain; charset=utf-8'; '.svg'='image/svg+xml'; '.ico'='image/x-icon' }

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
        $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
        $path = Join-Path $root $rel
        if (Test-Path $path -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($path)
            $ext = [System.IO.Path]::GetExtension($path).ToLower()
            $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
            $ctx.Response.StatusCode = 200
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $ctx.Response.StatusCode = 404
            $b = [System.Text.Encoding]::UTF8.GetBytes('404')
            $ctx.Response.OutputStream.Write($b, 0, $b.Length)
        }
        $ctx.Response.OutputStream.Close()
    } catch { }
}
