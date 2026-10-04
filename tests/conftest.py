"""Fixtures for the Area Manager tests."""
import pytest

# Import this repo's custom_components package before Home Assistant does,
# so the loader finds area_manager rather than the test plugin's own
# (empty) custom_components folder.
import custom_components.area_manager  # noqa: F401


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Let Home Assistant load custom_components/area_manager."""
    yield
