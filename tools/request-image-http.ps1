# Internal Windows transport only. Called by the gated Node runner, not interactively.
# Private request/response payloads use captured process pipes, never command arguments/files.
$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Net.Http
    [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $uri = [Uri]$request.url
    if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'oqalpauljjhytnrpzcqp.supabase.co' -or $uri.Port -ne 443 -or $uri.UserInfo -or $uri.Fragment) { throw 'Target refused' }
    if ($request.method -notin @('GET','POST')) { throw 'Method refused' }
    $p = $uri.AbsolutePath
    $allowed = ($request.method -eq 'GET' -and ($p -eq '/auth/v1/user' -or $p -match '^/storage/v1/object/(public|authenticated)/request-images/[A-Za-z0-9_/-]+\.(png|jpg|jpeg|webp)$') -and -not $uri.Query) -or
        ($request.method -eq 'POST' -and $p -eq '/auth/v1/token' -and $uri.Query -eq '?grant_type=password') -or
        ($request.method -eq 'POST' -and -not $uri.Query -and ($p -in @('/rest/v1/rpc/request_image_reference','/rest/v1/rpc/request_image_access_contract','/storage/v1/object/list/request-images') -or $p -match '^/storage/v1/object/sign/request-images/[A-Za-z0-9_/-]+\.(png|jpg|jpeg|webp)$'))
    if (-not $allowed) { throw 'Route refused' }
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $false
    $handler.UseProxy = $true
    $handler.Proxy = [Net.WebRequest]::DefaultWebProxy
    # Preserve an explicitly configured proxy; never retry directly after proxy failure.
    $proxyAddress = if ($env:HTTPS_PROXY) { $env:HTTPS_PROXY } elseif ($env:https_proxy) { $env:https_proxy } elseif ($env:ALL_PROXY) { $env:ALL_PROXY } else { $null }
    if ($proxyAddress) { $handler.Proxy = [Net.WebProxy]::new([Uri]$proxyAddress) }
    $handler.UseCookies = $false
    # Keep OS certificate verification, trust and proxy policy. Never override TLS validation.
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(25)
    $message = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($request.method), $uri)
    if ($null -ne $request.body) { $message.Content = [System.Net.Http.StringContent]::new($request.body, [Text.Encoding]::UTF8, 'application/json') }
    foreach ($property in $request.headers.PSObject.Properties) {
        if ($property.Name -ne 'Content-Type') { $null = $message.Headers.TryAddWithoutValidation($property.Name, [string]$property.Value) }
    }
    $response = $client.SendAsync($message, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
    $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    $memory = New-Object System.IO.MemoryStream
    $buffer = New-Object byte[] 16384
    while (($count = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
        if ($memory.Length + $count -gt 5242880) { throw 'Response limit' }
        $memory.Write($buffer, 0, $count)
    }
    $headers = @{}
    foreach ($key in @('cache-control','age','expires','etag','last-modified','content-type','content-length','date','cache-status','x-cache','cf-cache-status')) {
        if ($response.Headers.Contains($key)) { $headers[$key] = ($response.Headers.GetValues($key) -join ', ') }
        elseif ($response.Content.Headers.Contains($key)) { $headers[$key] = ($response.Content.Headers.GetValues($key) -join ', ') }
    }
    $result = @{ok=$true;status=[int]$response.StatusCode;headers=$headers;bodyBase64=[Convert]::ToBase64String($memory.ToArray())}
    [Console]::Out.WriteLine(($result | ConvertTo-Json -Depth 6 -Compress))
    $memory.Dispose();$stream.Dispose();$response.Dispose();$message.Dispose();$client.Dispose();$handler.Dispose()
    exit 0
} catch {
    # No raw exceptions, response content, URLs, paths, credentials or tokens in errors.
    [Console]::Out.WriteLine('{"ok":false,"safeCode":"WINDOWS_HTTP_TRANSPORT_FAILED"}')
    exit 2
}
