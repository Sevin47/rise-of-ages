## The isometric projection, and the handful of constants that depend on it.
##
## Positions are kept in tile coordinates everywhere except at the moment of
## drawing. A citizen at (12.4, 30.1) is twelve and a bit tiles across and
## thirty down, whatever the camera is doing. Only `to_screen` knows about
## pixels, which is what keeps the simulation and the view from tangling.
class_name Iso

## Kenney's isometric landscape tiles: a 2:1 base diamond, 132 by 66.
const TILE_W := 132.0
const TILE_H := 66.0


## Tile coordinates to screen. The whole isometric illusion is these two lines:
## x depends on the difference of the coordinates, y on their sum.
static func to_screen(tx: float, ty: float) -> Vector2:
	return Vector2((tx - ty) * (TILE_W / 2.0), (tx + ty) * (TILE_H / 2.0))


## Screen back to tile coordinates, for working out what the mouse is over.
static func to_tile(p: Vector2) -> Vector2:
	var a := p.x / (TILE_W / 2.0)
	var b := p.y / (TILE_H / 2.0)
	return Vector2((a + b) / 2.0, (b - a) / 2.0)


## Centre of a building's footprint, in tile coordinates.
static func tile_centre(tx: int, ty: int, n: int) -> Vector2:
	return Vector2(tx + n / 2.0, ty + n / 2.0)
