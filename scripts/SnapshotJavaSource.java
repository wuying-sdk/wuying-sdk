import com.sun.source.tree.*;
import com.sun.source.util.*;
import java.nio.file.*;
import java.util.*;
import javax.tools.*;

/** Parse deprecation contracts only. No SDK code or annotation processor is run. */
public final class SnapshotJavaSource {
    static String quoted(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }
    public static void main(String[] args) throws Exception {
        Path root = Paths.get(args[0]);
        List<java.io.File> files = new ArrayList<>();
        try (java.util.stream.Stream<Path> stream = Files.walk(root)) {
            stream.filter(p -> p.toString().endsWith(".java")).sorted().forEach(p -> files.add(p.toFile()));
        }
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new IllegalStateException("A JDK is required for declaration snapshots");
        List<String> deprecated = new ArrayList<>();
        List<String> hidden = new ArrayList<>();
        try (StandardJavaFileManager manager = compiler.getStandardFileManager(null, null, java.nio.charset.StandardCharsets.UTF_8)) {
            JavacTask task = (JavacTask) compiler.getTask(null, manager, null, Arrays.asList("-proc:none"), null, manager.getJavaFileObjectsFromFiles(files));
            DocTrees docs = DocTrees.instance(task);
            for (CompilationUnitTree unit : task.parse()) {
                new TreePathScanner<Void, Deque<String>>() {
                    boolean marked(ModifiersTree modifiers) {
                        boolean annotation = modifiers.getAnnotations().stream().anyMatch(a -> a.getAnnotationType().toString().equals("Deprecated") || a.getAnnotationType().toString().equals("java.lang.Deprecated"));
                        com.sun.source.doctree.DocCommentTree comment = docs.getDocCommentTree(getCurrentPath());
                        return annotation || comment != null && comment.getBlockTags().stream().anyMatch(t -> t.getKind() == com.sun.source.doctree.DocTree.Kind.DEPRECATED);
                    }
                    boolean hidden() {
                        com.sun.source.doctree.DocCommentTree comment = docs.getDocCommentTree(getCurrentPath());
                        return comment != null && comment.getBlockTags().stream().anyMatch(t -> t.getKind().toString().equals("HIDDEN"));
                    }
                    void recordHidden(Deque<String> names, String name) {
                        hidden.add("{\"owner\":" + quoted(owner(names)) + ",\"name\":" + quoted(name) + "}");
                    }
                    String owner(Deque<String> names) { return unit.getPackageName() + "." + String.join("$", names); }
                    void record(Deque<String> names, String name, String kind) {
                        deprecated.add("{\"owner\":" + quoted(owner(names)) + ",\"name\":" + quoted(name) + ",\"kind\":" + quoted(kind) + "}");
                    }
                    @Override public Void visitClass(ClassTree node, Deque<String> names) {
                        if (node.getSimpleName().length() == 0) return null;
                        names.addLast(node.getSimpleName().toString());
                        if (marked(node.getModifiers())) record(names, "*", "class");
                        if (hidden()) recordHidden(names, "*");
                        super.visitClass(node, names); names.removeLast(); return null;
                    }
                    @Override public Void visitMethod(MethodTree node, Deque<String> names) {
                        if (marked(node.getModifiers())) record(names, node.getName().contentEquals("<init>") ? "constructor" : node.getName().toString(), "method");
                        if (hidden()) recordHidden(names, node.getName().contentEquals("<init>") ? "constructor" : node.getName().toString());
                        return null; // No need to parse local implementation classes as API owners.
                    }
                    @Override public Void visitVariable(VariableTree node, Deque<String> names) {
                        if (marked(node.getModifiers())) record(names, node.getName().toString(), "field");
                        return null;
                    }
                }.scan(unit, new ArrayDeque<>());
            }
        }
        System.out.println("{\"deprecated_annotations\":[" + String.join(",", deprecated) + "],\"hidden_annotations\":[" + String.join(",", hidden) + "]}");
    }
}
