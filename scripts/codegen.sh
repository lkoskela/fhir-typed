#!/bin/sh

# Parse command line arguments
while [ "$#" -gt 0 ]; do
    case "$1" in
        --update-tool)
            UPDATE_TOOL=1
            shift
            ;;
        --update-generated-files)
            UPDATE_GENERATED_FILES=1
            shift
            ;;
        *)
            printf '%s\n' "Unknown argument: $1" >&2
            printf '%s\n' "Usage: $0 [--update-tool] [--update-generated-files]" >&2
            exit 1
            ;;
    esac
done

# Download and build the fhir-codegen executable as needed
WORKING_DIR=$(pwd)
printf '%s\n' "Running in working directory: $WORKING_DIR"
printf 'Running %s/scripts/download-fhir-codegen.sh %s\n' "$WORKING_DIR" "$*"
. "$WORKING_DIR/scripts/download-fhir-codegen.sh" "$@"

# explicitly return to working dir after sourcing the download script!
cd "$WORKING_DIR" || exit 1

if [ -z "$FHIR_CODEGEN_EXECUTABLE" ]; then
    printf '%s\n' "FHIR codegen executable path not published via FHIR_CODEGEN_EXECUTABLE. Exiting." >&2
    exit 1
elif [ ! -f "$FHIR_CODEGEN_EXECUTABLE" ]; then
    printf '%s\n' "FHIR codegen executable not found at $FHIR_CODEGEN_EXECUTABLE" >&2
    exit 1
else
    printf '%s\n' "Using fhir-codegen executable from $FHIR_CODEGEN_EXECUTABLE"
fi

###
# Finally, generate TypeScript code from the FHIR definitions.
###
OUTPUT_DIR_RELATIVE="./src/generated"

# Ensure the relative output dir exists before resolving absolute path
mkdir -p "$OUTPUT_DIR_RELATIVE"

# Resolve to absolute path in a portable way (use realpath if available)
if command -v realpath >/dev/null 2>&1; then
    OUTPUT_DIR=$(realpath "$OUTPUT_DIR_RELATIVE")
else
    # POSIX way: cd into dir and use pwd -P, preserving original dir
    _OLDPWD=$(pwd)
    cd "$OUTPUT_DIR_RELATIVE" || {
        printf '%s\n' "Failed to cd to $OUTPUT_DIR_RELATIVE" >&2
        exit 1
    }
    # Use pwd -P to get physical path if the shell supports -P; plain pwd is widely available.
    OUTPUT_DIR=$(pwd -P 2>/dev/null || pwd)
    cd "$_OLDPWD" || exit 1
    unset _OLDPWD
fi

mkdir -p "$OUTPUT_DIR"

FHIR_VERSION_NUMBER="4.0.1"

OUTPUT_FILE_R4="FHIR-r4.ts"
if [ -n "$UPDATE_GENERATED_FILES" ] || [ ! -f "$OUTPUT_DIR/$OUTPUT_FILE_R4" ]; then
    printf '%s\n' "Generating $OUTPUT_FILE_R4 based on FHIR Core R4 definitions..."
    "$FHIR_CODEGEN_EXECUTABLE" generate typescript \
        --min-ts-version 5.4.3 \
        --resolve-dependencies \
        --auto-load-expansions \
        --use-official-registries \
        --fhir-version "$FHIR_VERSION_NUMBER" \
        --package "hl7.fhir.r4.core#$FHIR_VERSION_NUMBER" \
        --output-dir "$OUTPUT_DIR" \
        --output-filename "$OUTPUT_FILE_R4"

    if [ -f "$OUTPUT_DIR/$OUTPUT_FILE_R4" ]; then
        # Portable in-place edit: write to a temp file and move it over the original
        TMPDIR=${TMPDIR-/tmp}
        TMPFILE="$TMPDIR/replace-outputdir.$$"
        # sed expression: replace the OutputDirectory option value with the relative path
        sed 's|^\([[:space:]]*// Option: "OutputDirectory" = \)".*"|\1"'"$OUTPUT_DIR_RELATIVE"'"|' "$OUTPUT_DIR/$OUTPUT_FILE_R4" > "$TMPFILE" \
            || {
                printf '%s\n' "Error: sed failed" >&2
                rm -f "$TMPFILE"
                exit 1
            }
        mv "$TMPFILE" "$OUTPUT_DIR/$OUTPUT_FILE_R4" || {
            printf '%s\n' "Error: mv failed when replacing $OUTPUT_DIR/$OUTPUT_FILE_R4" >&2
            rm -f "$TMPFILE"
            exit 1
        }
    else
        printf '%s\n' "Error: $OUTPUT_DIR/$OUTPUT_FILE_R4 not found? Can't replace OutputDirectory." >&2
        exit 1
    fi
else
    printf '%s\n' "$OUTPUT_DIR/$OUTPUT_FILE_R4 already exists. Skipping."
fi