/* ==============================================================================
 * CompileCraft - Shared TAC Virtual Machine Value Types (Milestone 15)
 *
 * Tagged runtime value representation shared across C, C++, and Java
 * programs compiled to Three-Address Code (TAC).
 * ============================================================================== */

#ifndef COMPILECRAFT_VM_VALUE_H
#define COMPILECRAFT_VM_VALUE_H

#ifdef __cplusplus
extern "C" {
#endif

typedef enum VmValueKind {
    VM_VAL_UNINIT = 0,
    VM_VAL_INT,
    VM_VAL_FLOAT,
    VM_VAL_BOOL,
    VM_VAL_STRING
} VmValueKind;

typedef struct VmValue {
    VmValueKind kind;
    union {
        int ival;
        double fval;
        int bval;
        char *sval;
    } as;
} VmValue;

VmValue vm_value_uninit(void);
VmValue vm_value_int(int v);
VmValue vm_value_float(double v);
VmValue vm_value_bool(int b);

/* Allocate and own an unescaped string copy in *out. Returns 1 on success, 0 on OOM. */
int vm_value_make_string(VmValue *out, const char *s);

/* Deep copy src into dest (caller must ensure dest does not hold live data or free it first). */
int vm_value_copy(VmValue *dest, const VmValue *src);

/* Release owned memory (if VM_VAL_STRING) and reset to VM_VAL_UNINIT. */
void vm_value_free(VmValue *val);

int vm_value_is_numeric(const VmValue *val);
double vm_value_as_double(const VmValue *val);
int vm_value_is_truthy(const VmValue *val, int *out_bool);
const char *vm_value_kind_name(VmValueKind kind);

/*
 * Parse a TAC operand literal (int, float, bool "true"/"false", or quoted string "...").
 * Sets *matched = 1 if operand represents a literal, 0 if it is a variable/temporary name.
 * Returns 1 on success (even when *matched == 0), 0 on OOM or malformed/overflow literal.
 */
int vm_value_parse_literal(const char *operand, VmValue *out, int *matched);

#ifdef __cplusplus
}
#endif

#endif /* COMPILECRAFT_VM_VALUE_H */
