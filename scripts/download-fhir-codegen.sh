#!/bin/sh

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --update-tool)
            UPDATE_TOOL=1
            shift
            ;;
    esac
done


###
# First, make sure we've got the "fhir-codegen" submodule in place and up to date.
# If not, add it or update it before proceeding.
###
FHIRCODEGEN_DIR="$HOME/.fhir-codegen"
if [ -d "$FHIRCODEGEN_DIR" ] && [ "$UPDATE_TOOL" != "" ]; then
    echo "Updating fhir-codegen..."
    rm -rf "$FHIRCODEGEN_DIR"
fi
if [ ! -d "$FHIRCODEGEN_DIR" ]; then
    REPOSITORY_URL="git@github.com:microsoft/fhir-codegen.git"
    echo "Cloning $REPOSITORY_URL to $FHIRCODEGEN_DIR ..."
    git clone --depth=1 --single-branch --branch=main "$REPOSITORY_URL" "$FHIRCODEGEN_DIR"
fi


###
# Second, make sure we've got the fhir-codegen executable in place.
# If not, build it.
###
BINARY="$FHIRCODEGEN_DIR/src/fhir-codegen/bin/Release/net8.0/fhir-codegen"
if [ ! -f "$BINARY" ]; then
    echo "$BINARY not found. Building..."
    pushd $FHIRCODEGEN_DIR > /dev/null
    trap "popd > /dev/null" EXIT
    echo "Building fhir-codegen in $(pwd)..."
    dotnet build -c Release --verbosity quiet --nologo
    # For some reason, the fhir-codegen binary at $BINARY is not always found immediately
    # after the preceding commands. So we wait a second before proceeding.
    if [ ! -f "$BINARY" ]; then
        sleep 5;
        if [ ! -f "$BINARY" ]; then
            echo "fhir-codegen executable not found at $BINARY"
            exit 1
        fi
    fi
    echo "Built fhir-codegen successfully at $BINARY"
fi

# Export the path to the fhir-codegen executable for use in other scripts
export FHIR_CODEGEN_EXECUTABLE="$BINARY"
