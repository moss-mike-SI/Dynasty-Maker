"""Command line entry point: `dynasty <command>`."""

import typer

from dynasty import __version__

API_HOST = "127.0.0.1"

app = typer.Typer(no_args_is_help=True, help="Fantasy hockey GM assistant.")


@app.command()
def version() -> None:
    """Print the installed version."""
    typer.echo(__version__)


@app.command()
def serve(port: int = 8000, reload: bool = False) -> None:
    """Run the API that the web UI talks to. It has no login, so it listens on this PC only."""
    import uvicorn

    uvicorn.run("dynasty.api.app:app", host=API_HOST, port=port, reload=reload)
