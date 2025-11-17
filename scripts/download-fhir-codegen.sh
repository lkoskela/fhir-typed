#!/bin/sh

# Parse command line arguments
while [ "$#" -gt 0 ]; do
    case "$1" in
        --update-tool)
            UPDATE_TOOL=1
            shift
            ;;
        *)
            # Unknown args are ignored in your original; adjust if you want to error out
            shift
            ;;
    esac
done

###
# First, make sure we've got the "fhir-codegen" submodule in place and up to date.
###
FHIRCODEGEN_DIR="$(pwd)/.fhir-codegen"
echo "FHIRCODEGEN_DIR is '$FHIRCODEGEN_DIR'"

if [ -d "$FHIRCODEGEN_DIR" ] && [ -n "$UPDATE_TOOL" ]; then
    printf '%s\n' "Updating fhir-codegen..."
    rm -rf "$FHIRCODEGEN_DIR"
fi

if [ ! -d "$FHIRCODEGEN_DIR" ]; then
    REPOSITORY_URL="git@github.com:microsoft/fhir-codegen.git"
    printf '%s\n' "Cloning $REPOSITORY_URL to $FHIRCODEGEN_DIR ..."
    git clone --depth=1 --single-branch --branch=main "$REPOSITORY_URL" "$FHIRCODEGEN_DIR" || {
        printf '%s\n' "git clone failed" >&2
        exit 1
    }
fi

###
# Second, make sure we've got the fhir-codegen executable in place.
###
BINARY="$FHIRCODEGEN_DIR/src/fhir-codegen/bin/Release/net8.0/fhir-codegen"

if [ ! -f "$BINARY" ]; then
    printf '%s\n' "$BINARY not found. Building..."

    # Save current directory, cd into repo, and ensure we return on exit
    _OLDPWD=$(pwd)
    cd "$FHIRCODEGEN_DIR" || {
        printf '%s\n' "Failed to cd to $FHIRCODEGEN_DIR" >&2
        exit 1
    }
    # Register trap to restore original dir on exit (expand _OLDPWD now)
    trap "cd \"$_OLDPWD\" >/dev/null 2>&1" EXIT

    printf '%s\n' "Building fhir-codegen in $(pwd)..."
    dotnet build -c Release --verbosity quiet --nologo || {
        printf '%s\n' "dotnet build failed" >&2
        exit 1
    }

    # Wait briefly if the binary isn't immediately visible
    if [ ! -f "$BINARY" ]; then
        sleep 5
        if [ ! -f "$BINARY" ]; then
            printf '%s\n' "fhir-codegen executable not found at $BINARY" >&2
            exit 1
        fi
    fi

    printf '%s\n' "Built fhir-codegen successfully at $BINARY"
    # trap will restore the original directory here when script exits or continues
fi

# Export path for other scripts
export FHIR_CODEGEN_EXECUTABLE="$BINARY"