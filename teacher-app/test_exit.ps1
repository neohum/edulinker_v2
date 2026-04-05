try { Write-Host "THROW"; throw "err" } catch { Write-Host "CATCH"; exit 1 } finally { Write-Host "FINALLY" }
