# Updates prices.json: Poizon yuan price and availability for every size.
# Runs daily in GitHub Actions (pwsh) and can be run by hand on Windows.
$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot
$file = Join-Path $root 'prices.json'
$ua = @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' }
$data = Get-Content $file -Raw -Encoding utf8 | ConvertFrom-Json

# g — первое фото варианта (цвета): карточка = один цвет, остальные цвета той же модели не учитываем
function Get-Sizes([string]$slug, [string]$g) {
  $r = Invoke-WebRequest -Uri "https://unicorngo.ru/product/$slug" -TimeoutSec 40 -UseBasicParsing -Headers $ua
  if (-not $r) { return $null }
  $h = $r.Content
  $sb = New-Object System.Text.StringBuilder
  foreach ($m in [regex]::Matches($h, 'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)')) {
    $s = $m.Groups[1].Value; try { $s = [regex]::Unescape($s) } catch { }; [void]$sb.Append($s)
  }
  $rsc = $sb.ToString()
  $map = @{}
  foreach ($line in ($rsc -split "`n")) { $lm = [regex]::Match($line, '^([0-9a-f]+):(.*)$'); if ($lm.Success) { $map[$lm.Groups[1].Value] = $lm.Groups[2].Value } }
  $sizes = [ordered]@{}
  foreach ($m in [regex]::Matches($rsc, '\{"skuId":(\d+),"price":(\d+),"cnyPrice":(\d+),"size":"\$([0-9a-f]+)"([^}]*)\}')) {
    if ($g) {
      $im = [regex]::Match($m.Groups[5].Value, '"images":"\$([0-9a-f]+)"').Groups[1].Value; $first = ''
      if ($im -and $map.ContainsKey($im)) { $first = [regex]::Match($map[$im], '"(https?://[^"]+)"').Groups[1].Value }
      if ($first -ne $g) { continue }
    }
    $ref = $m.Groups[4].Value; $eu = ''
    if ($map.ContainsKey($ref)) {
      foreach ($key in 'eu', 'size', 'primary') { $v = [regex]::Match($map[$ref], '"' + $key + '":"([^"]+)"').Groups[1].Value; if ($v -and -not $v.StartsWith('$')) { $eu = $v; break } }
    }
    if (-not $eu) { $eu = 'one' }
    $cny = [int]$m.Groups[3].Value; $rub = [int]$m.Groups[2].Value
    if (-not $sizes.Contains($eu) -or ($cny -gt 0 -and ($sizes[$eu][0] -eq 0 -or $cny -lt $sizes[$eu][0]))) { $sizes[$eu] = @($cny, $rub) }
  }
  if ($sizes.Count -eq 0) { return $null }
  return $sizes
}

$ok = 0; $fail = 0
foreach ($p in $data.items.PSObject.Properties) {
  $sz = Get-Sizes $p.Value.slug $p.Value.g
  # t — когда наличие последний раз подтвердилось: приложение не продаёт вещь, если проверки не было двое суток
  if ($sz) { $p.Value.sizes = $sz; $p.Value | Add-Member -NotePropertyName t -NotePropertyValue ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) -Force; $ok++ } else { $fail++ }
  Start-Sleep -Milliseconds 400
}
$data.updated = [DateTime]::UtcNow.AddHours(5).ToString('dd.MM, HH:mm')   # время Екатеринбурга: цены обновляются три раза в день

# курс обменника рядом с ценами: приложение берёт его, если браузерные прокси не ответили
try {
  $t = (Invoke-WebRequest -Uri 'https://t.me/s/amblixObmen' -TimeoutSec 30 -UseBasicParsing -Headers $ua).Content -replace '<br\s*/?>', "`n" -replace '<[^>]+>', ''   # цифры бывают разрезаны тегами: 13,7</b>5<b>₽
  $num = { param($rx) $m = [regex]::Matches($t, $rx); if ($m.Count) { [double]($m[$m.Count - 1].Groups[1].Value -replace ',', '.') } else { 0 } }
  $big = & $num '[Оо]т\s*1000\s*¥?\s*[-–—:]\s*(\d+[.,]?\d*)\s*₽'
  $small = & $num '[Дд]о\s*1000\s*¥?\s*[-–—:]\s*(\d+[.,]?\d*)\s*₽'
  $dm = [regex]::Matches($t, 'курс на (\d+\s+[а-яё]+)')
  if ($small -gt 5 -and $small -lt 50) {
    $rate = [ordered]@{ small = $small; big = $(if ($big -gt 5) { $big } else { $small }); date = $(if ($dm.Count) { $dm[$dm.Count - 1].Groups[1].Value } else { '' }) }
    $data | Add-Member -NotePropertyName rate -NotePropertyValue $rate -Force
    Write-Host "rate $small / $big"
  }
} catch { Write-Host 'rate: channel not available' }
$json = $data | ConvertTo-Json -Depth 6 -Compress
[IO.File]::WriteAllText($file, $json, (New-Object Text.UTF8Encoding $false))
Write-Host "updated $ok, failed $fail"
