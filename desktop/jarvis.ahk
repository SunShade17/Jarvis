#Requires AutoHotkey v2.0
#SingleInstance Force

; Start this script only when you want desktop capture enabled.
; A hotstring erases the trigger in ordinary editable controls and opens an
; explicit input box. Only the submitted box contents go to the local server.
Hotstring(":*:/Todo:", CaptureTask)
Hotstring(":*:/Todo ", CaptureTask)
^!j::CaptureTask()

CaptureTask(*) {
    entry := InputBox("What do you need to do?", "Jarvis · Personal task", "w430 h130")
    if entry.Result != "OK" || Trim(entry.Value) = ""
        return
    value := StrReplace(entry.Value, "\", "\\")
    value := StrReplace(value, '"', '\"')
    value := StrReplace(value, Chr(9), "\t")
    port := EnvGet("PORT")
    if !RegExMatch(port, "^\d{1,5}$")
        port := "4317"
    try {
        client := ComObject("WinHttp.WinHttpRequest.5.1")
        client.SetTimeouts(1500, 1500, 2500, 3000)
        client.Open("POST", "http://127.0.0.1:" port "/api/quick", false)
        client.SetRequestHeader("Content-Type", "application/json")
        client.Send('{"text":"/Todo: ' value '"}')
        if client.Status != 200
            throw Error("Server returned " client.Status)
        TrayTip("Saved to your personal workspace.", "Jarvis")
    } catch {
        MsgBox("Could not reach Jarvis. Start the local server and try again." Chr(10) Chr(10) entry.Value, "Jarvis")
    }
}
