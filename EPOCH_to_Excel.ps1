Add-Type -AssemblyName System.Windows.Forms

$portName = 'COM5'
$baudRate = 9600

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     EPOCH 650 -> LEGION NTD LIVE WEDGE (LOC-1 -> 12)     " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Connecting to $portName..." -ForegroundColor White

try {
    $port = New-Object System.IO.Ports.SerialPort $portName, $baudRate, 'None', 8, 'One'
    $port.ReadTimeout = 300
    $port.WriteTimeout = 300
    $port.Open()
    Write-Host "[SUCCESS] Connected to EPOCH 650 on $portName!" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Could not open $portName. Please check cable or close any other tools using it." -ForegroundColor Red
    Write-Host $_
    $availablePorts = [System.IO.Ports.SerialPort]::GetPortNames()
    if ($availablePorts.Length -gt 0) {
        Write-Host "Available COM ports detected: $($availablePorts -join ', ')" -ForegroundColor Yellow
    }
    Read-Host "Press Enter to exit"
    exit
}

function Query-EPOCH($cmd) {
    $port.DiscardInBuffer()
    $port.Write("$cmd`r`n")
    Start-Sleep -Milliseconds 80
    $resp = ""
    while ($port.BytesToRead -gt 0) {
        $resp += $port.ReadExisting()
        Start-Sleep -Milliseconds 30
    }
    return $resp.Trim()
}

# Verify instrument
$sno = Query-EPOCH "param_SNo?"
Write-Host "[INFO] EPOCH 650 Hardware Handshake OK! (SNo: $sno)" -ForegroundColor Green
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host " HOW TO USE LIVE DATA ENTRY WITH LEGION NTD:" -ForegroundColor Yellow
Write-Host " 1. Open Legion NTD in your browser and click inside 'Loc-1'." -ForegroundColor White
Write-Host " 2. Put transducer on workpiece test point 1." -ForegroundColor White
Write-Host " 3. Press the 'FREEZE' button on the EPOCH 650." -ForegroundColor Cyan
Write-Host "    -> Thickness is typed & moves automatically to next box!" -ForegroundColor Green
Write-Host "    -> Advances: Loc-1 -> Loc-2 -> Loc-3 ... -> Loc-12" -ForegroundColor Green
Write-Host "    -> Beeps and unfreezes machine instantly for next point!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "LISTENING FOR FREEZE BUTTON... (Press Ctrl+C to stop)`n" -ForegroundColor Cyan

$locIndex = 1

while ($true) {
    try {
        # Check if the user pressed FREEZE on the machine
        $fzResp = Query-EPOCH "param_Freeze?"
        
        # Check if first line is 1
        $lines = $fzResp -split "`r?`n"
        if ($lines.Count -gt 0 -and $lines[0].Trim() -eq "1") {
            Write-Host "[TRIGGERED] FREEZE button pressed on EPOCH 650!" -ForegroundColor Magenta
            
            # Query thickness reading from Gate 1
            $thkResp = Query-EPOCH "param_R_G1MxD?"
            $thkLines = $thkResp -split "`r?`n"
            
            $val = ""
            foreach ($l in $thkLines) {
                if ($l.Trim() -match '^[-+]?\d*\.?\d+$') {
                    $val = $l.Trim()
                    break
                }
            }
            
            if ($val -ne "") {
                Write-Host "[CAPTURED] Loc-$locIndex Thickness: $val mm" -ForegroundColor Yellow
                Write-Host "[LEGION NTD] Typing $val and pressing TAB to advance..." -ForegroundColor Green
                
                # Send value and TAB to move to next location field
                [System.Windows.Forms.SendKeys]::SendWait("$val{TAB}")
                
                # Audio confirmation beep (1200 Hz, 150ms)
                [System.Console]::Beep(1200, 150)
                
                if ($locIndex -ge 12) {
                    Write-Host "`n*** [WORKPIECE COMPLETE] All 12 Locations recorded! ***" -ForegroundColor Cyan
                    [System.Console]::Beep(1600, 250)
                    $locIndex = 1
                    Write-Host "Ready for next workpiece: Click 'Loc-1' on the new form.`n" -ForegroundColor Yellow
                } else {
                    $locIndex++
                    Write-Host "Next point ready: Loc-$locIndex`n" -ForegroundColor Gray
                }
                
                # Automatically unfreeze the machine so inspector can test next spot immediately
                Start-Sleep -Milliseconds 250
                $null = Query-EPOCH "param_Freeze=0"
                Write-Host "[READY] EPOCH 650 unfrozen. Listening for next spot..." -ForegroundColor Cyan
            }
            Start-Sleep -Milliseconds 400
        }
    } catch {
        # Ignore timeout hiccups
    }
    Start-Sleep -Milliseconds 100
}

$port.Close()
