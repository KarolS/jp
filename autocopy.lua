require 'mp'
local function on_new_sub()
	local text
	text = mp.get_property("sub-text")
	if text then
		print ("subtitle: " .. text)
		mp.set_property('clipboard/text', text)
	end
end

mp.observe_property("sub-text", "string", on_new_sub);
