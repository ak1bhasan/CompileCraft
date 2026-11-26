/* ==============================================================================
 * CompileCraft - Shared TAC Virtual Machine Interface (Milestone 15)
 *
 * Executes verified Three-Address Code (TacList) programs produced by the
 * CompileCraft front-end pipeline (C, C++, Java).
 * ============================================================================== */

#ifndef COMPILECRAFT_VM_H
#define COMPILECRAFT_VM_H

#include "tac.h"
#include "vm_value.h"
#include <stddef.h>
#include <stdio.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
    VM_DEFAULT_MAX_STEPS = 1000000
};

typedef enum VmStatus {
    VM_OK = 0,
    VM_ERR_INVALID_INPUT,
    VM_ERR_OOM,
    VM_ERR_RUNTIME,
    VM_ERR_STEP_LIMIT
} VmStatus;

typedef struct VmConfig {
    size_t max_steps; /* 0 uses VM_DEFAULT_MAX_STEPS */
    FILE *out;        /* NULL uses stdout */
    FILE *err;        /* NULL uses stderr */
} VmConfig;

typedef struct VmResult {
    VmStatus status;
    size_t steps_executed;
    int error_line; /* > 0 when source line is available, 0 otherwise */
    char error_message[256];
} VmResult;

typedef struct VmVarEntry {
    char *name;
    VmValue value;
} VmVarEntry;

typedef struct VmLabelEntry {
    char *name;
    size_t pc;
} VmLabelEntry;

typedef struct VmState {
    VmVarEntry *vars;
    size_t var_count;
    size_t var_capacity;

    VmValue *args;
    size_t arg_count;
    size_t arg_capacity;

    VmLabelEntry *labels;
    size_t label_count;
    size_t label_capacity;

    size_t steps_executed;
    size_t max_steps;
    FILE *out;
    FILE *err;
    VmResult result;
} VmState;

VmState *vm_state_create(const VmConfig *config);
void vm_state_destroy(VmState *state);

/* Lookup a variable or temporary stored in VM state (NULL if unset). */
const VmValue *vm_state_get_var(const VmState *state, const char *name);

/* Execute a TacList inside an initialized VmState. */
VmStatus vm_execute_state(VmState *state, const TacList *tac);

/* One-shot execution convenience wrapper (cleans up all VM state before returning). */
VmStatus vm_execute(const TacList *tac, const VmConfig *config, VmResult *result);

#ifdef __cplusplus
}
#endif

#endif /* COMPILECRAFT_VM_H */
