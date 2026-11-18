// snapshot-go-public-api extracts declarations only; it never executes SDK code.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type Entry struct {
	Package   string `json:"package"`
	Owner     string `json:"owner"`
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	Signature string `json:"signature"`
	Doc       string `json:"doc,omitempty"`
	Origin    string `json:"origin,omitempty"`
}
type TypeInfo struct {
	Pkg, Name, Origin string
	Public            bool
	Alias             string
	Embedded          []string
}

func main() {
	if len(os.Args) != 2 {
		panic("expected extracted SDK root")
	}
	root := os.Args[1]
	fset := token.NewFileSet()
	entries := []Entry{}
	methods := map[string][]Entry{}
	types := map[string]*TypeInfo{}
	functions := map[string]Entry{}
	functionAliases := map[string]string{}
	hashes := map[string]string{}
	packages := map[string]bool{}
	module := "github.com/aliyun/wuying-sdk-go"
	render := func(n ast.Node) string {
		var out bytes.Buffer
		if err := format.Node(&out, fset, n); err != nil {
			panic(err)
		}
		return out.String()
	}
	var reference func(ast.Expr, string, map[string]string) string
	reference = func(expr ast.Expr, pkg string, imports map[string]string) string {
		switch x := expr.(type) {
		case *ast.Ident:
			return pkg + "." + x.Name
		case *ast.SelectorExpr:
			if owner, ok := x.X.(*ast.Ident); ok {
				return imports[owner.Name] + "." + x.Sel.Name
			}
		case *ast.StarExpr:
			return reference(x.X, pkg, imports)
		case *ast.IndexExpr:
			return reference(x.X, pkg, imports)
		case *ast.IndexListExpr:
			return reference(x.X, pkg, imports)
		}
		return ""
	}
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") || strings.HasPrefix(rel, "scripts/") || strings.HasPrefix(rel, "tools/") || strings.HasPrefix(rel, "examples/") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		hashes[rel] = fmt.Sprintf("%x", sha256.Sum256(data))
		file, err := parser.ParseFile(fset, path, data, parser.ParseComments)
		if err != nil {
			return err
		}
		dir := filepath.ToSlash(filepath.Dir(rel))
		pkg := module
		if dir != "." {
			pkg += "/" + dir
		}
		public := !strings.Contains("/"+dir+"/", "/internal/")
		if public {
			packages[pkg] = true
		}
		imports := map[string]string{}
		for _, item := range file.Imports {
			q := strings.Trim(item.Path.Value, "\"")
			name := filepath.Base(q)
			if item.Name != nil {
				name = item.Name.Name
			}
			imports[name] = q
		}
		for _, decl := range file.Decls {
			switch node := decl.(type) {
			case *ast.FuncDecl:
				if !ast.IsExported(node.Name.Name) {
					continue
				}
				owner := ""
				receiver := ""
				if node.Recv != nil {
					receiver = render(node.Recv.List[0].Type)
					key := reference(node.Recv.List[0].Type, pkg, imports)
					if key == "" {
						return fmt.Errorf("unknown receiver: %s", receiver)
					}
					owner = key[strings.LastIndex(key, ".")+1:]
				}
				doc := ""
				if node.Doc != nil {
					doc = node.Doc.Text()
				}
				kind := "function"
				prefix := "func "
				if owner != "" {
					kind = "method"
					prefix += "(receiver " + receiver + ") "
				}
				entry := Entry{pkg, owner, node.Name.Name, kind, prefix + node.Name.Name + strings.TrimPrefix(render(node.Type), "func"), doc, rel}
				if owner == "" {
					functions[pkg+"."+node.Name.Name] = entry
					if public {
						entries = append(entries, entry)
					}
				} else {
					methods[pkg+"."+owner] = append(methods[pkg+"."+owner], entry)
				}
			case *ast.GenDecl:
				for _, spec := range node.Specs {
					switch item := spec.(type) {
					case *ast.TypeSpec:
						key := pkg + "." + item.Name.Name
						ti := &TypeInfo{Pkg: pkg, Name: item.Name.Name, Origin: rel, Public: public && ast.IsExported(item.Name.Name)}
						types[key] = ti
						if item.Assign.IsValid() {
							ti.Alias = reference(item.Type, pkg, imports)
						}
						if iface, ok := item.Type.(*ast.InterfaceType); ok {
							for _, field := range iface.Methods.List {
								if len(field.Names) == 0 {
									if r := reference(field.Type, pkg, imports); r != "" {
										ti.Embedded = append(ti.Embedded, r)
									}
									continue
								}
								for _, name := range field.Names {
									fn, ok := field.Type.(*ast.FuncType)
									if !ok || !ast.IsExported(name.Name) {
										continue
									}
									doc := ""
									if field.Doc != nil {
										doc = field.Doc.Text()
									}
									methods[key] = append(methods[key], Entry{pkg, item.Name.Name, name.Name, "interface-method", name.Name + strings.TrimPrefix(render(fn), "func"), doc, rel})
								}
							}
						}
						if structure, ok := item.Type.(*ast.StructType); ok {
							for _, field := range structure.Fields.List {
								if len(field.Names) == 0 {
									if r := reference(field.Type, pkg, imports); r != "" {
										ti.Embedded = append(ti.Embedded, r)
									}
								}
							}
						}
					case *ast.ValueSpec:
						if public {
							for i, name := range item.Names {
								if ast.IsExported(name.Name) && i < len(item.Values) {
									if r := reference(item.Values[i], pkg, imports); r != "" {
										functionAliases[pkg+"."+name.Name] = r
									}
								}
							}
						}
					}
				}
			}
		}
		return nil
	})
	if err != nil {
		panic(err)
	}
	var resolve func(string, map[string]bool) []Entry
	resolve = func(key string, seen map[string]bool) []Entry {
		if seen[key] {
			return nil
		}
		seen[key] = true
		out := append([]Entry{}, methods[key]...)
		if ti := types[key]; ti != nil {
			if ti.Alias != "" {
				out = append(out, resolve(ti.Alias, seen)...)
			}
			for _, embedded := range ti.Embedded {
				out = append(out, resolve(embedded, seen)...)
			}
		}
		return out
	}
	for key, ti := range types {
		if !ti.Public {
			continue
		}
		used := map[string]bool{}
		for _, method := range resolve(key, map[string]bool{}) {
			if used[method.Name] {
				continue
			}
			used[method.Name] = true
			if method.Owner != ti.Name || method.Package != ti.Pkg {
				old := method.Owner
				method.Kind = "promoted-method"
				method.Signature = strings.Replace(method.Signature, old,
					ti.Name, 1)
			}
			method.Package = ti.Pkg
			method.Owner = ti.Name
			entries = append(entries, method)
		}
	}
	for key, target := range functionAliases {
		if original, ok := functions[target]; ok {
			dot := strings.LastIndex(key, ".")
			name := key[dot+1:]
			original.Signature = strings.Replace(original.Signature, "func "+original.Name, "func "+name, 1)
			original.Package = key[:dot]
			original.Name = name
			original.Kind = "function-alias"
			entries = append(entries, original)
		}
	}
	sort.Slice(entries, func(i, j int) bool {
		a, b := entries[i], entries[j]
		return a.Package+"."+a.Owner+"."+a.Name+a.Signature < b.Package+"."+b.Owner+"."+b.Name+b.Signature
	})
	publicPackages := []string{}
	for pkg := range packages {
		publicPackages = append(publicPackages, pkg)
	}
	sort.Strings(publicPackages)
	if err := json.NewEncoder(os.Stdout).Encode(map[string]any{"language": "go", "entries": entries, "input_sha256": hashes, "public_packages": publicPackages}); err != nil {
		panic(err)
	}
}
