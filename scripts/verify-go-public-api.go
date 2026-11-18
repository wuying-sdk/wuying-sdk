// verify-go-public-api independently obtains the compiler's public method sets.
package main

import (
	"encoding/json"
	"fmt"
	"go/importer"
	"go/token"
	"go/types"
	"io"
	"os"
	"os/exec"
	"sort"
)

func main() {
	if len(os.Args) != 2 {
		panic("expected SDK root")
	}
	cmd := exec.Command("go", "list", "-mod=readonly", "-export", "-deps", "-json", ".", "./config", "./manager", "./model", "./mobile")
	cmd.Dir = os.Args[1]
	data, err := cmd.Output()
	if err != nil {
		if e, ok := err.(*exec.ExitError); ok {
			panic(string(e.Stderr))
		}
		panic(err)
	}
	decoder := json.NewDecoder(bytesReader(data))
	exports := map[string]string{}
	for {
		var pkg struct{ ImportPath, Export string }
		if err := decoder.Decode(&pkg); err == io.EOF {
			break
		} else if err != nil {
			panic(err)
		}
		exports[pkg.ImportPath] = pkg.Export
	}
	reader := func(name string) (io.ReadCloser, error) { return os.Open(exports[name]) }
	imp := importer.ForCompiler(token.NewFileSet(), "gc", reader)
	names := []string{"github.com/aliyun/wuying-sdk-go", "github.com/aliyun/wuying-sdk-go/config", "github.com/aliyun/wuying-sdk-go/manager", "github.com/aliyun/wuying-sdk-go/model", "github.com/aliyun/wuying-sdk-go/mobile"}
	ids := map[string]bool{}
	for _, name := range names {
		pkg, err := imp.Import(name)
		if err != nil {
			panic(err)
		}
		for _, member := range pkg.Scope().Names() {
			object := pkg.Scope().Lookup(member)
			if !object.Exported() {
				continue
			}
			switch object.(type) {
			case *types.Func:
				ids[name+".."+member] = true
			case *types.Var:
				if _, ok := object.Type().Underlying().(*types.Signature); ok {
					ids[name+".."+member] = true
				}
			case *types.TypeName:
				for _, typ := range []types.Type{object.Type(), types.NewPointer(object.Type())} {
					set := types.NewMethodSet(typ)
					for i := 0; i < set.Len(); i++ {
						method := set.At(i).Obj()
						if method.Exported() {
							ids[name+"."+member+"."+method.Name()] = true
						}
					}
				}
			}
		}
	}
	list := []string{}
	for id := range ids {
		list = append(list, id)
	}
	sort.Strings(list)
	if err := json.NewEncoder(os.Stdout).Encode(map[string]any{"compiler_public_callable_ids": list}); err != nil {
		panic(err)
	}
	fmt.Fprintln(os.Stderr, "Compiler verified", len(list), "public functions and method entries")
}

type sliceReader struct{ b []byte }

func (r *sliceReader) Read(p []byte) (int, error) {
	if len(r.b) == 0 {
		return 0, io.EOF
	}
	n := copy(p, r.b)
	r.b = r.b[n:]
	return n, nil
}
func bytesReader(b []byte) io.Reader { return &sliceReader{b} }
