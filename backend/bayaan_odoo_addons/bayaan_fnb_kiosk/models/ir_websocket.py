from odoo import models


class IrWebsocket(models.AbstractModel):
    _inherit = "ir.websocket"

    def _build_bus_channel_list(self, channels):
        realtime = self.env["bayaan.realtime"].sudo()
        allowed = set(realtime._channels_for_user(self.env.user, self.env.company))
        sanitized = []
        for channel in channels:
            if isinstance(channel, str) and channel.startswith("bayaan.realtime."):
                if channel in allowed:
                    sanitized.append(channel)
            else:
                sanitized.append(channel)
        return super()._build_bus_channel_list(sanitized)
