package main

import (
	"encoding/binary"
	"io"
	"os"

	"github.com/go-compressions/lzfse"
)

func main() {
	if len(os.Args) != 2 {
		_, _ = os.Stderr.WriteString("usage: pulse-lzfse compress|decompress|serve\n")
		os.Exit(1)
	}

	if os.Args[1] == "serve" {
		if err := serve(os.Stdin, os.Stdout); err != nil {
			_, _ = os.Stderr.WriteString(err.Error())
			os.Exit(1)
		}
		return
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
		_, _ = os.Stderr.WriteString("usage: pulse-lzfse compress|decompress|serve\n")
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

func serve(reader io.Reader, writer io.Writer) error {
	header := make([]byte, 5)
	for {
		_, err := io.ReadFull(reader, header)
		if err == io.EOF || err == io.ErrUnexpectedEOF {
			return nil
		}
		if err != nil {
			return err
		}

		input := make([]byte, binary.BigEndian.Uint32(header[1:]))
		if _, err := io.ReadFull(reader, input); err != nil {
			return err
		}

		var output []byte
		switch header[0] {
		case 'c':
			output, err = lzfse.Compress(input)
		case 'd':
			output, err = lzfse.Decompress(input)
		default:
			err = io.ErrUnexpectedEOF
		}

		if err != nil {
			if writeErr := writeResponse(writer, 0, []byte(err.Error())); writeErr != nil {
				return writeErr
			}
			continue
		}
		if err := writeResponse(writer, 1, output); err != nil {
			return err
		}
	}
}

func writeResponse(writer io.Writer, status byte, payload []byte) error {
	header := make([]byte, 5)
	header[0] = status
	binary.BigEndian.PutUint32(header[1:], uint32(len(payload)))
	if _, err := writer.Write(header); err != nil {
		return err
	}
	_, err := writer.Write(payload)
	return err
}
