package main

import (
	"syscall/js"

	"github.com/go-compressions/lzfse"
)

func main() {
	api := js.Global().Get("Object").New()
	api.Set("compress", makeCodecFunc(lzfse.Compress))
	api.Set("decompress", makeCodecFunc(lzfse.Decompress))
	js.Global().Set("pulseLzfse", api)
	select {}
}

func makeCodecFunc(codec func([]byte) ([]byte, error)) js.Func {
	return js.FuncOf(func(_ js.Value, args []js.Value) any {
		if len(args) != 1 {
			return makeError("expected one Uint8Array argument")
		}

		input := make([]byte, args[0].Get("byteLength").Int())
		js.CopyBytesToGo(input, args[0])

		output, err := codec(input)
		if err != nil {
			return makeError(err.Error())
		}

		data := js.Global().Get("Uint8Array").New(len(output))
		js.CopyBytesToJS(data, output)

		result := js.Global().Get("Object").New()
		result.Set("ok", true)
		result.Set("data", data)
		return result
	})
}

func makeError(message string) js.Value {
	result := js.Global().Get("Object").New()
	result.Set("ok", false)
	result.Set("error", message)
	return result
}
