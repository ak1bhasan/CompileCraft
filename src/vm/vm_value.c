/* ==============================================================================
 * CompileCraft - Shared TAC Virtual Machine Value Helpers (Milestone 15)
 * ============================================================================== */

#include "vm_value.h"
#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdlib.h>
#include <string.h>

static char *vm_alloc_copy(const char *s, size_t len) {
    char *copy = (char *)malloc(len + 1);
    if (!copy) {
        return NULL;
    }
    if (len > 0) {
        memcpy(copy, s, len);
    }
    copy[len] = '\0';
    return copy;
}

VmValue vm_value_uninit(void) {
    VmValue v;
    v.kind = VM_VAL_UNINIT;
    v.as.ival = 0;
    return v;
}

VmValue vm_value_int(int val) {
    VmValue v;
    v.kind = VM_VAL_INT;
    v.as.ival = val;
    return v;
}

VmValue vm_value_float(double val) {
    VmValue v;
    v.kind = VM_VAL_FLOAT;
    v.as.fval = val;
    return v;
}

VmValue vm_value_bool(int b) {
    VmValue v;
    v.kind = VM_VAL_BOOL;
    v.as.bval = (b != 0) ? 1 : 0;
    return v;
}

int vm_value_make_string(VmValue *out, const char *s) {
    if (!out) {
        return 0;
    }
    const char *src = s ? s : "";
    char *copy = vm_alloc_copy(src, strlen(src));
    if (!copy) {
        *out = vm_value_uninit();
        return 0;
    }
    out->kind = VM_VAL_STRING;
    out->as.sval = copy;
    return 1;
}

int vm_value_copy(VmValue *dest, const VmValue *src) {
    if (!dest || !src) {
        return 0;
    }
    if (src->kind == VM_VAL_STRING) {
        return vm_value_make_string(dest, src->as.sval);
    }
    *dest = *src;
    return 1;
}

void vm_value_free(VmValue *val) {
    if (!val) {
        return;
    }
    if (val->kind == VM_VAL_STRING) {
        free(val->as.sval);
    }
    *val = vm_value_uninit();
}

int vm_value_is_numeric(const VmValue *val) {
    return val && (val->kind == VM_VAL_INT || val->kind == VM_VAL_FLOAT);
}

double vm_value_as_double(const VmValue *val) {
    if (!val) {
        return 0.0;
    }
    if (val->kind == VM_VAL_INT) {
        return (double)val->as.ival;
    }
    if (val->kind == VM_VAL_FLOAT) {
        return val->as.fval;
    }
    return 0.0;
}

int vm_value_is_truthy(const VmValue *val, int *out_bool) {
    if (!val || !out_bool) {
        return 0;
    }
    switch (val->kind) {
        case VM_VAL_BOOL:
            *out_bool = (val->as.bval != 0) ? 1 : 0;
            return 1;
        case VM_VAL_INT:
            *out_bool = (val->as.ival != 0) ? 1 : 0;
            return 1;
        case VM_VAL_FLOAT:
            *out_bool = (val->as.fval != 0.0) ? 1 : 0;
            return 1;
        default:
            return 0;
    }
}

const char *vm_value_kind_name(VmValueKind kind) {
    switch (kind) {
        case VM_VAL_UNINIT: return "uninitialized";
        case VM_VAL_INT:    return "int";
        case VM_VAL_FLOAT:  return "float";
        case VM_VAL_BOOL:   return "bool";
        case VM_VAL_STRING: return "string";
        default:            return "unknown";
    }
}

static int parse_quoted_string_literal(const char *operand, size_t len, VmValue *out) {
    char *buf = (char *)malloc(len + 1);
    if (!buf) {
        *out = vm_value_uninit();
        return 0;
    }

    size_t out_idx = 0;
    size_t i = 1;
    size_t end = len - 1;
    while (i < end) {
        char c = operand[i];
        if (c == '\\' && i + 1 < end) {
            char esc = operand[i + 1];
            if (esc == '0') {
                /* C-string semantics: stop at NUL escape cleanly. */
                break;
            }
            switch (esc) {
                case 'n':  buf[out_idx++] = '\n'; break;
                case 't':  buf[out_idx++] = '\t'; break;
                case 'r':  buf[out_idx++] = '\r'; break;
                case '\\': buf[out_idx++] = '\\'; break;
                case '"':  buf[out_idx++] = '"'; break;
                case '\'': buf[out_idx++] = '\''; break;
                default:
                    free(buf);
                    *out = vm_value_uninit();
                    return 0;
            }
            i += 2;
        } else if (c == '\\') {
            free(buf);
            *out = vm_value_uninit();
            return 0;
        } else {
            buf[out_idx++] = c;
            i++;
        }
    }

    buf[out_idx] = '\0';
    out->kind = VM_VAL_STRING;
    out->as.sval = buf;
    return 1;
}

int vm_value_parse_literal(const char *operand, VmValue *out, int *matched) {
    if (matched) {
        *matched = 0;
    }
    if (!operand || !out || !matched) {
        return 0;
    }

    *out = vm_value_uninit();
    size_t len = strlen(operand);
    if (len == 0) {
        return 0;
    }

    if (strcmp(operand, "true") == 0) {
        *matched = 1;
        *out = vm_value_bool(1);
        return 1;
    }
    if (strcmp(operand, "false") == 0) {
        *matched = 1;
        *out = vm_value_bool(0);
        return 1;
    }

    if (len >= 2 && operand[0] == '"' && operand[len - 1] == '"') {
        *matched = 1;
        return parse_quoted_string_literal(operand, len, out);
    }

    const char *p = operand;
    if (*p == '-' || *p == '+') {
        p++;
    }
    if (!isdigit((unsigned char)*p) && *p != '.') {
        return 1;
    }

    int is_float = 0;
    for (const char *scan = p; *scan; scan++) {
        if (*scan == '.' || *scan == 'e' || *scan == 'E') {
            is_float = 1;
            break;
        }
    }

    if (is_float) {
        char *endptr = NULL;
        errno = 0;
        double dval = strtod(operand, &endptr);
        if (endptr == operand || *endptr != '\0' || errno == ERANGE) {
            return 0;
        }
        *matched = 1;
        *out = vm_value_float(dval);
        return 1;
    }

    char *endptr = NULL;
    errno = 0;
    long lval = strtol(operand, &endptr, 10);
    if (endptr == operand || *endptr != '\0' || errno == ERANGE ||
        lval < INT_MIN || lval > INT_MAX) {
        return 0;
    }
    *matched = 1;
    *out = vm_value_int((int)lval);
    return 1;
}
