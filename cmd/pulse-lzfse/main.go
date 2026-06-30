package main

import (
	"io"
	"os"

	"github.com/go-compressions/lzfse"
)

func main() {
	if len(os.Args) != 2 {
		_, _ = os.Stderr.WriteString("usage: pulse-lzfse compress|decompress\n")
		os.Exit(1)
	}

	input, err := io.ReadAll(os.Stdin)
	if err != nil {
		_, _ = os.Stderr.WriteString(err.Error())
		os.Exit(1)
	}

	var output []byte
	if os.Args[1] == "compress" {
		output, err = lzfse.Compress(input)
	} else if os.Args[1] == "decompress" {
		output, err = lzfse.Decompress(input)
	} else {
		_, _ = os.Stderr.WriteString("usage: pulse-lzfse compress|decompress\n")
		os.Exit(1)
	}

	if err != nil {
		_, _ = os.Stderr.WriteString(err.Error())
		os.Exit(1)
	}

	_, err = os.Stdout.Write(output)
	if err != nil {
		_, _ = os.Stderr.WriteString(err.Error())
		os.Exit(1)
	}
}
