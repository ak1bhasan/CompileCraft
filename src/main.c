/* ==============================================================================
 * CompileCraft - Unified Multi-Language CLI Driver (Milestone 8)
 *
 * Dispatches source files by extension to the language-specific compiler:
 *   .c    -> compilecraft-c.exe
 *   .cpp  -> compilecraft-cpp.exe
 *   .java -> compilecraft-java.exe
 *
 * Executes child compiler executables directly via OS process APIs (no shell).
 * ============================================================================== */

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#else
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
#endif

static const char *get_basename_ptr(const char *path) {
    const char *last_fwd = strrchr(path, '/');
    const char *last_back = strrchr(path, '\\');
    const char *sep = last_fwd;
    if (last_back && (!sep || last_back > sep)) {
        sep = last_back;
    }
    return sep ? (sep + 1) : path;
}

static const char *get_extension(const char *path) {
    const char *base = get_basename_ptr(path);
    const char *dot = strrchr(base, '.');
    if (!dot || dot == base || dot[1] == '\0') {
        return NULL;
    }
    return dot;
}

static int eq_nocase(const char *a, const char *b) {
    while (*a && *b) {
        int ca = tolower((unsigned char)*a);
        int cb = tolower((unsigned char)*b);
        if (ca != cb) {
            return 0;
        }
        a++;
        b++;
    }
    return (*a == '\0' && *b == '\0');
}

static void print_usage(FILE *out, const char *argv0) {
    const char *prog = (argv0 && *argv0) ? get_basename_ptr(argv0) : "compilecraft";
    fprintf(out,
            "CompileCraft - Multi-Language Compiler & Virtual Machine\n"
            "Usage: %s [--tokens | --ast | --symtab | --run] <source-file>\n"
            "       %s --help\n"
            "\n"
            "Supported Input Languages (bounded subsets executed via shared TAC VM):\n"
            "  .c     C procedural subset (_Bool/bool, control flow)\n"
            "  .cpp   C++ procedural subset (bool, control flow)\n"
            "  .java  Java class/main subset (boolean, control flow)\n"
            "\n"
            "Options:\n"
            "  --tokens      Print lexical token stream and exit\n"
            "  --ast         Print AST and skip semantic analysis / TAC\n"
            "  --symtab      Print scoped symbol table entries and skip TAC\n"
            "  --run         Compile to TAC and execute via shared TAC VM\n"
            "  -h, --help    Show this help message\n",
            prog, prog);
}

typedef enum CliMode {
    MODE_TAC = 0,
    MODE_TOKENS,
    MODE_AST,
    MODE_SYMTAB,
    MODE_RUN
} CliMode;

static const char *resolve_compiler_name(const char *ext, CliMode mode) {
#ifdef _WIN32
    if (mode == MODE_TOKENS) {
        if (eq_nocase(ext, ".c")) {
            return "compilecraft-lexer-c.exe";
        }
        if (eq_nocase(ext, ".cpp")) {
            return "compilecraft-lexer-cpp.exe";
        }
        if (eq_nocase(ext, ".java")) {
            return "compilecraft-lexer-java.exe";
        }
        return NULL;
    }
    if (eq_nocase(ext, ".c")) {
        return "compilecraft-c.exe";
    }
    if (eq_nocase(ext, ".cpp")) {
        return "compilecraft-cpp.exe";
    }
    if (eq_nocase(ext, ".java")) {
        return "compilecraft-java.exe";
    }
#else
    if (mode == MODE_TOKENS) {
        if (eq_nocase(ext, ".c")) {
            return "compilecraft-lexer-c";
        }
        if (eq_nocase(ext, ".cpp")) {
            return "compilecraft-lexer-cpp";
        }
        if (eq_nocase(ext, ".java")) {
            return "compilecraft-lexer-java";
        }
        return NULL;
    }
    if (eq_nocase(ext, ".c")) {
        return "compilecraft-c";
    }
    if (eq_nocase(ext, ".cpp")) {
        return "compilecraft-cpp";
    }
    if (eq_nocase(ext, ".java")) {
        return "compilecraft-java";
    }
#endif
    return NULL;
}

static int file_is_executable_or_present(const char *path) {
#ifdef _WIN32
    DWORD attr = GetFileAttributesA(path);
    return (attr != INVALID_FILE_ATTRIBUTES) &&
           ((attr & FILE_ATTRIBUTE_DIRECTORY) == 0);
#else
    return access(path, X_OK) == 0;
#endif
}

static int join_path(char *out, size_t out_sz, const char *dir, const char *suffix) {
    size_t dlen = strlen(dir);
    size_t slen = strlen(suffix);
    int need_sep = (dlen > 0 && dir[dlen - 1] != '/' && dir[dlen - 1] != '\\');
#ifdef _WIN32
    const char sep = '\\';
#else
    const char sep = '/';
#endif

    if (dlen + (need_sep ? 1u : 0u) + slen + 1u > out_sz) {
        return 0;
    }

    memcpy(out, dir, dlen);
    if (need_sep) {
        out[dlen] = sep;
        memcpy(out + dlen + 1, suffix, slen + 1);
    } else {
        memcpy(out + dlen, suffix, slen + 1);
    }
    return 1;
}

static int extract_dir(const char *path, char *out_dir, size_t out_sz) {
    const char *base = get_basename_ptr(path);
    size_t dir_len = (size_t)(base - path);
    if (dir_len == 0) {
        if (out_sz < 2) {
            return 0;
        }
        out_dir[0] = '.';
        out_dir[1] = '\0';
        return 1;
    }
    /* Trim trailing slash unless root path like "/" or "C:\" */
    while (dir_len > 1 && (path[dir_len - 1] == '/' || path[dir_len - 1] == '\\')) {
#ifdef _WIN32
        if (dir_len == 3 && path[1] == ':') {
            break;
        }
#endif
        dir_len--;
    }
    if (dir_len + 1u > out_sz) {
        return 0;
    }
    memcpy(out_dir, path, dir_len);
    out_dir[dir_len] = '\0';
    return 1;
}

static int resolve_compiler_path(const char *argv0,
                                 const char *tool_name,
                                 char *out_path,
                                 size_t out_sz) {
    char self_path[4096];
    char self_dir[4096];
    char bin_dir[4096];

#ifdef _WIN32
    DWORD len = GetModuleFileNameA(NULL, self_path, (DWORD)sizeof(self_path));
    if (len == 0 || len >= (DWORD)sizeof(self_path)) {
        if (!argv0 || strlen(argv0) >= sizeof(self_path)) {
            return 0;
        }
        strcpy(self_path, argv0);
    }
#else
    if (!argv0 || strlen(argv0) >= sizeof(self_path)) {
        return 0;
    }
    strcpy(self_path, argv0);
#endif

    if (!extract_dir(self_path, self_dir, sizeof(self_dir))) {
        return 0;
    }

    /* Primary: sibling compiler binary in the same directory (e.g. bin/). */
    if (join_path(out_path, out_sz, self_dir, tool_name) &&
        file_is_executable_or_present(out_path)) {
        return 1;
    }

    /* Fallback: bin/<tool_name> below executable directory (root-copied binary). */
    if (join_path(bin_dir, sizeof(bin_dir), self_dir, "bin") &&
        join_path(out_path, out_sz, bin_dir, tool_name) &&
        file_is_executable_or_present(out_path)) {
        return 1;
    }

    return 0;
}

static int validate_source_file(const char *path) {
#ifdef _WIN32
    DWORD attr = GetFileAttributesA(path);
    if (attr != INVALID_FILE_ATTRIBUTES && (attr & FILE_ATTRIBUTE_DIRECTORY) != 0) {
        fprintf(stderr, "Error: Source path '%s' is a directory, not a file.\n", path);
        return 0;
    }
#endif
    FILE *f = fopen(path, "r");
    if (!f) {
        fprintf(stderr, "Error: Cannot open source file '%s'\n", path);
        return 0;
    }
    fclose(f);
    return 1;
}

#ifdef _WIN32
typedef struct DynStr {
    char *data;
    size_t len;
    size_t cap;
} DynStr;

static int dynstr_append_char(DynStr *s, char c) {
    if (s->len + 2 > s->cap) {
        size_t new_cap = (s->cap == 0) ? 256 : (s->cap * 2);
        char *next = (char *)realloc(s->data, new_cap);
        if (!next) {
            return 0;
        }
        s->data = next;
        s->cap = new_cap;
    }
    s->data[s->len++] = c;
    s->data[s->len] = '\0';
    return 1;
}

/* Quote argument according to Windows CommandLineToArgvW rules. */
static int append_quoted_win_arg(DynStr *s, const char *arg) {
    const char *p = arg;
    if (s->len > 0 && !dynstr_append_char(s, ' ')) {
        return 0;
    }
    if (!dynstr_append_char(s, '\"')) {
        return 0;
    }
    while (*p) {
        size_t bs_count = 0;
        while (*p == '\\') {
            bs_count++;
            p++;
        }
        if (*p == '\0') {
            for (size_t i = 0; i < bs_count * 2; i++) {
                if (!dynstr_append_char(s, '\\')) {
                    return 0;
                }
            }
            break;
        } else if (*p == '\"') {
            for (size_t i = 0; i < bs_count * 2 + 1; i++) {
                if (!dynstr_append_char(s, '\\')) {
                    return 0;
                }
            }
            if (!dynstr_append_char(s, '\"')) {
                return 0;
            }
            p++;
        } else {
            for (size_t i = 0; i < bs_count; i++) {
                if (!dynstr_append_char(s, '\\')) {
                    return 0;
                }
            }
            if (!dynstr_append_char(s, *p)) {
                return 0;
            }
            p++;
        }
    }
    return dynstr_append_char(s, '\"');
}

static const char *mode_child_flag(CliMode mode) {
    switch (mode) {
        case MODE_AST:    return "--ast";
        case MODE_SYMTAB: return "--symtab";
        case MODE_RUN:    return "--run";
        case MODE_TOKENS:
        case MODE_TAC:
        default:          return NULL;
    }
}

static int run_compiler_process(const char *tool_path,
                                const char *source_path,
                                const char *extra_flag) {
    DynStr cmd = {NULL, 0, 0};
    if (!append_quoted_win_arg(&cmd, tool_path)) {
        free(cmd.data);
        return 1;
    }
    if (extra_flag && !append_quoted_win_arg(&cmd, extra_flag)) {
        free(cmd.data);
        return 1;
    }
    if (!append_quoted_win_arg(&cmd, source_path)) {
        free(cmd.data);
        return 1;
    }

    fflush(stdout);
    fflush(stderr);

    STARTUPINFOA si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    ZeroMemory(&pi, sizeof(pi));

    if (!CreateProcessA(tool_path,
                        cmd.data,
                        NULL,
                        NULL,
                        TRUE,
                        0,
                        NULL,
                        NULL,
                        &si,
                        &pi)) {
        fprintf(stderr, "Error: Failed to launch compiler '%s' (Windows error %lu)\n",
                tool_path, (unsigned long)GetLastError());
        free(cmd.data);
        return 1;
    }

    free(cmd.data);

    WaitForSingleObject(pi.hProcess, INFINITE);

    DWORD exit_code = 1;
    if (!GetExitCodeProcess(pi.hProcess, &exit_code)) {
        exit_code = 1;
    }

    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    return (exit_code == 0) ? 0 : 1;
}
#else
static const char *mode_child_flag(CliMode mode) {
    switch (mode) {
        case MODE_AST:    return "--ast";
        case MODE_SYMTAB: return "--symtab";
        case MODE_RUN:    return "--run";
        case MODE_TOKENS:
        case MODE_TAC:
        default:          return NULL;
    }
}

static int run_compiler_process(const char *tool_path,
                                const char *source_path,
                                const char *extra_flag) {
    fflush(stdout);
    fflush(stderr);

    pid_t pid = fork();
    if (pid < 0) {
        fprintf(stderr, "Error: Failed to fork compiler process.\n");
        return 1;
    }
    if (pid == 0) {
        char *argv_flag[4];
        char *argv_tac[3];
        if (extra_flag) {
            argv_flag[0] = (char *)tool_path;
            argv_flag[1] = (char *)extra_flag;
            argv_flag[2] = (char *)source_path;
            argv_flag[3] = NULL;
            execv(tool_path, argv_flag);
        } else {
            argv_tac[0] = (char *)tool_path;
            argv_tac[1] = (char *)source_path;
            argv_tac[2] = NULL;
            execv(tool_path, argv_tac);
        }
        _exit(127);
    }

    int status = 0;
    if (waitpid(pid, &status, 0) < 0) {
        return 1;
    }
    if (WIFEXITED(status) && WEXITSTATUS(status) == 0) {
        return 0;
    }
    return 1;
}
#endif

int main(int argc, char **argv) {
    const char *source_path = NULL;
    CliMode mode = MODE_TAC;
    int mode_count = 0;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0) {
            print_usage(stdout, argv[0]);
            return 0;
        } else if (strcmp(argv[i], "--tokens") == 0) {
            mode = MODE_TOKENS;
            mode_count++;
        } else if (strcmp(argv[i], "--ast") == 0) {
            mode = MODE_AST;
            mode_count++;
        } else if (strcmp(argv[i], "--symtab") == 0) {
            mode = MODE_SYMTAB;
            mode_count++;
        } else if (strcmp(argv[i], "--run") == 0) {
            mode = MODE_RUN;
            mode_count++;
        } else if (argv[i][0] == '-') {
            fprintf(stderr, "Error: Unknown option '%s'\n", argv[i]);
            print_usage(stderr, argv[0]);
            return 1;
        } else {
            if (source_path != NULL) {
                fprintf(stderr, "Error: Multiple source files provided ('%s' and '%s')\n",
                        source_path, argv[i]);
                print_usage(stderr, argv[0]);
                return 1;
            }
            source_path = argv[i];
        }
    }

    if (mode_count > 1) {
        fprintf(stderr, "Error: Specify at most one output mode (--tokens, --ast, --symtab, or --run).\n");
        print_usage(stderr, argv[0]);
        return 1;
    }

    if (source_path == NULL) {
        fprintf(stderr, "Error: No input source file specified.\n");
        print_usage(stderr, argv[0]);
        return 1;
    }

    const char *ext = get_extension(source_path);
    if (!ext) {
        fprintf(stderr,
                "Error: Missing file extension for '%s'. Supported extensions: .c, .cpp, .java\n",
                source_path);
        return 1;
    }

    const char *tool_name = resolve_compiler_name(ext, mode);
    if (!tool_name) {
        fprintf(stderr,
                "Error: Unsupported file extension '%s' for '%s'. Supported extensions: .c, .cpp, .java\n",
                ext, source_path);
        return 1;
    }

    if (!validate_source_file(source_path)) {
        return 1;
    }

    char tool_path[4096];
    if (!resolve_compiler_path(argv[0], tool_name, tool_path, sizeof(tool_path))) {
        fprintf(stderr,
                "Error: Could not locate language compiler executable '%s'. Build with 'mingw32-make all'.\n",
                tool_name);
        return 1;
    }

    return run_compiler_process(tool_path, source_path, mode_child_flag(mode));
}
