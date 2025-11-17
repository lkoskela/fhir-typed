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
            echo "Unknown argument: $1" >&2
            echo "Usage: $0 [--update-tool] [--update-generated-files]" >&2
            exit 1
            ;;
    esac
done

# Download and build the fhir-codegen executable as needed
WORKING_DIR=$(pwd)
source ./scripts/download-fhir-codegen.sh $@
cd $WORKING_DIR

if [ "$FHIR_CODEGEN_EXECUTABLE" == "" ]; then
    echo "FHIR codegen executable path not published via FHIR_CODEGEN_EXECUTABLE. Exiting."
    exit 1
elif [ ! -f "$FHIR_CODEGEN_EXECUTABLE" ]; then
    echo "FHIR codegen executable not found at $FHIR_CODEGEN_EXECUTABLE"
    exit 1
else
    echo "Using fhir-codegen executable from $FHIR_CODEGEN_EXECUTABLE"
fi

###
# Finally, generate TypeScript code from the FHIR definitions.
###
OUTPUT_DIR_RELATIVE="./src/generated"
OUTPUT_DIR=$(realpath $OUTPUT_DIR_RELATIVE)
mkdir -p $OUTPUT_DIR

FHIR_VERSION_NUMBER="4.0.1"

OUTPUT_FILE_R4="FHIR-r4.ts"
if [ "$UPDATE_GENERATED_FILES" != "" ] || [ ! -f "$OUTPUT_DIR/$OUTPUT_FILE_R4" ]; then
    echo "Generating $OUTPUT_FILE_R4 based on FHIR Core R4 definitions..."
    "$FHIR_CODEGEN_EXECUTABLE" generate typescript \
        --min-ts-version 5.4.3 \
        --resolve-dependencies \
        --auto-load-expansions \
        --use-official-registries \
        --fhir-version $FHIR_VERSION_NUMBER \
        --package "hl7.fhir.r4.core#$FHIR_VERSION_NUMBER" \
        --output-dir "$OUTPUT_DIR" \
        --output-filename "$OUTPUT_FILE_R4"
    if [ -f "$OUTPUT_DIR/$OUTPUT_FILE_R4" ]; then
        # Remove the "OutputDirectory" option from the generated file to avoid unnecessary diffs
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' 's|^\([[:space:]]*// Option: "OutputDirectory" = \)".*"|\1"'$OUTPUT_DIR_RELATIVE'"|' "$OUTPUT_DIR/$OUTPUT_FILE_R4"
        else
            sed -i 's|^\([[:space:]]*// Option: "OutputDirectory" = \)".*"|\1"'$OUTPUT_DIR_RELATIVE'"|' "$OUTPUT_DIR/$OUTPUT_FILE_R4"
        fi
    else
        echo "Error: $OUTPUT_DIR/$OUTPUT_FILE_R4 not found? Can't replace OutputDirectory."
        exit 1
    fi
else
    echo "$OUTPUT_DIR/$OUTPUT_FILE_R4 already exists. Skipping."
fi
